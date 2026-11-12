import { getTickSize } from "@/lib/get-tick-size";
import { createGaussian, createRng, gaussian, hashSeed } from "./prng";
import { isKrxHoliday } from "@/shared/utils/krxHolidays";
import {
  getKrxTradingDate,
  getKstDateAndMinutes,
  getPreviousKrxTradingDate,
} from "@/shared/utils/market";
import type { PriceSign, StockQuote } from "@/shared/types/quote";

// 가상 종목 시세 생성기. 입력은 DART 재무(EPS·BPS·배당 핀)와 시드뿐이고 실제 가격은
// 어디에도 쓰지 않는다 — 실제 가격 ± 노이즈는 시세 재배포와 같다.
// 일봉(정규장 종가 경로)이 원본이고 분봉은 일봉 안에 끼워 맞춘 브리지, 현재가는 분봉의
// "지금까지" — 헤더 = 분봉 마지막 = 일봉이 자동으로 정합된다.

// 이 날 이후의 경로는 자유 워크라 날짜가 고정이어야 이력이 영원히 불변이다.
export const DEMO_ANCHOR_DATE = "2026-11-03";

export type DemoMarket = "KRX" | "US" | "JP" | "HK" | "CN" | "DE";
export type DemoTier = "large" | "mid" | "small";
export type DemoPin = { date: string; price: number };
export type DemoAnchor = {
  eps: number | null;
  bps: number | null;
  // 결산일 실제 주가 수준(DPS ÷ 시가배당률). DEMO_ANCHOR_DATE 이후 핀은 무시한다.
  pins?: DemoPin[];
  // 상장주식수. 있으면 거래량 수준이 회전율로 정해진다.
  shares?: number | null;
};
export type TickerProfile = {
  tier: DemoTier;
  sigma: number;
  beta: number;
  volumeScale: number;
  nxEligible: boolean;
  // DEMO_ANCHOR_DATE 의 정규장 종가. 핀이 있으면 마지막 핀에서 걸어간 결과라 핀과 모순되지 않는다.
  anchorPrice: number;
  pins: DemoPin[];
  clusterPhase: number;
};
export type DemoDailyBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  regularClose: number;
  basePrice: number | null;
};
export type DemoMinuteBar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type DemoChannel = "UN" | "J" | "NX";

// ── 모델 상수 ─────────────────
const PRICE_MIN = 100;
const PRICE_MAX = 2_000_000;
const LIMIT_RATE = 0.3; // 상하한가
// 자유 워크 구간의 OU 항 r += −θ·ln(R(d-1)/L). 반감기 ≈ 90거래일 — 없으면 핀으로 잡은 수준이
// 1년 뒤 2배·절반까지 흩어진다. 핀 사이 브리지는 끝점이 고정이라 쓰지 않는다.
export const MEAN_REVERSION_THETA = 0.008;
const TIER_CUMULATIVE = { large: 0.1, mid: 0.4 } as const; // small = 나머지 60%
const TIER_SIGMA: Record<DemoTier, number> = { large: 0.012, mid: 0.02, small: 0.032 };
const TIER_BETA: Record<DemoTier, number> = { large: 0.9, mid: 1.0, small: 1.2 };
// 일 거래량 기준값(volumeScale). 일 거래량은 기준값 × 로그정규 × 수익률 가산이라 평균이 기준값의
// 약 2.5~3배다. 상장주식수가 있으면 기준값 = 상장주식수 × 회전율이고, 회전율 범위는 앵커 가격 기준
// 시가총액 구간에서 고른다(위에서부터 첫 구간) — 큰 종목일수록 회전율이 낮다. 없으면 tier 범위(주).
const TURNOVER_BANDS = [
  { minCap: 1e13, min: 0.0005, max: 0.002 }, // 10조 원 이상
  { minCap: 1e12, min: 0.0008, max: 0.004 }, // 1조 원 이상
  { minCap: 0, min: 0.001, max: 0.01 },
] as const;
const TIER_VOLUME: Record<DemoTier, readonly [number, number]> = {
  large: [5e5, 5e6],
  mid: [1e5, 1e6],
  small: [2e4, 3e5],
};
const SIGMA_JITTER_MIN = 0.8;
const SIGMA_JITTER_MAX = 1.25;
const BETA_JITTER = 0.2;
const NX_ELIGIBLE_RATE = 0.4;
// 앵커 사다리 — 각 칸은 결과가 이 범위 안일 때만 채택
const LADDER_MIN = 500;
const LADDER_MAX = 1_000_000;
const PER_MIN = 5;
const PER_SPAN = 35;
const PBR_MIN = 0.3;
const PBR_SPAN = 4.7;
const FALLBACK_PRICE_MIN = 1_000;
const FALLBACK_PRICE_MAX = 200_000;
// 시장 팩터 — 지수와 종목이 같은 날 같은 값을 본다
const MARKET_SIGMA: Record<DemoMarket, number> = {
  KRX: 0.009,
  US: 0.01,
  JP: 0.01,
  HK: 0.01,
  CN: 0.01,
  DE: 0.01,
};
// 일봉 — 정규장 종가 대비 비율
const AFTER_CLOSE_SIGMA_RATIO = 0.3; // 20:00 종가
const GAP_SIGMA_RATIO = 0.4; // 시가 갭
const WICK_SIGMA_RATIO = 0.6; // 고가·저가 확장
const VOLUME_LOGNORMAL_SIGMA = 0.5;
const VOLUME_RETURN_BOOST = 2;
// 변동성 군집 — σ × (0.7 + 0.6 × s), s 는 20일 주기 사인파
const CLUSTER_FLOOR = 0.7;
const CLUSTER_RANGE = 0.6;
const CLUSTER_PERIOD_DAYS = 20;
// 분봉 — 세션 창(KST 분) · 브리지 σ 비율 · 거래량 배분
const PRE_START_MIN = 8 * 60;
const PRE_END_MIN = 8 * 60 + 49; // 프리마켓 마지막 봉 — 08:50~08:59 는 체결이 없다
const REGULAR_START_MIN = 9 * 60;
const CLOSE_CALL_START_MIN = 15 * 60 + 20; // 15:20~15:29 는 종가 단일가 접수 — 체결이 없다
const REGULAR_END_MIN = 15 * 60 + 30; // 15:30 종가 단일가 봉
const NXT_AFTER_START_MIN = 15 * 60 + 40;
const KRX_AFTER_START_MIN = 16 * 60;
const AFTER_END_MIN = 20 * 60; // 20:00 봉 포함
const OPEN_AUCTION_SIGMA = 0.003; // 프리마켓 마지막 체결가와 09:00 시가 단일가의 로그 차
export const CLOSE_AUCTION_SIGMA = 0.002; // 15:19 종가와 15:30 종가 단일가의 로그 차. 지수도 같은 값을 쓴다.
const PRE_SIGMA_RATIO = 0.3;
const AFTER_SIGMA_RATIO = 0.4;
const MINUTE_WICK_RATIO = 0.5;
const PRE_VOLUME_SHARE = 0.03;
const AFTER_VOLUME_SHARE = 0.05;
const U_PROFILE_DEPTH = 2;
const MINUTE_VOLUME_LOGNORMAL_SIGMA = 0.5;
// 단일가 체결이 몰리는 봉의 결정 가중치 — 정규장 나머지 봉 평균의 배수. 지수도 같은 값을 쓴다.
export const OPEN_SPIKE_WEIGHTS = [10, 5, 4] as const; // 09:00 · 09:01 · 09:02
export const CLOSE_AUCTION_WEIGHT = 20; // 15:30

const DAY_MS = 86_400_000;
const MINUTE_SEC = 60;

// ── 달력 ─────────────────
const pad2 = (n: number): string => String(n).padStart(2, "0");
// 날짜 문자열 파싱은 워크 한 스텝의 가장 비싼 연산이라 날짜별로 한 번만 한다(구별 날짜 수천 개).
const dateToMsMemo = new Map<string, number>();
const dateToMs = (date: string): number => {
  let ms = dateToMsMemo.get(date);
  if (ms === undefined) {
    const [y, m, d] = date.split("-").map(Number);
    ms = Date.UTC(y, m - 1, d);
    dateToMsMemo.set(date, ms);
  }
  return ms;
};
const msToDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};
const isTradingDate = (date: string): boolean => {
  const dow = new Date(dateToMs(date)).getUTCDay();
  return dow !== 0 && dow !== 6 && !isKrxHoliday(date);
};

const scanTradingDates = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = dateToMs(from); t <= dateToMs(to); t += DAY_MS) {
    const date = msToDate(t);
    if (isTradingDate(date)) out.push(date);
  }
  return out;
};

// 거래일 표 — 이력 범위를 덮는 고정 구간을 한 번 세워 두고 창은 이진 탐색으로 자른다.
// 종목마다 날짜를 다시 세면 수천 종목 프로필 조립의 절반이 달력 산술이 된다.
const CALENDAR_START = "2015-01-01";
const CALENDAR_END = "2027-12-31";
let tradingDateTable: string[] | null = null;

const lowerBound = (table: readonly string[], date: string): number => {
  let lo = 0;
  let hi = table.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (table[mid] < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export const listTradingDates = (from: string, to: string): string[] => {
  if (from < CALENDAR_START || to > CALENDAR_END) return scanTradingDates(from, to);
  tradingDateTable ??= scanTradingDates(CALENDAR_START, CALENDAR_END);
  const start = lowerBound(tradingDateTable, from);
  const end = lowerBound(tradingDateTable, to);
  const inclusive = tradingDateTable[end] === to ? end + 1 : end;
  return tradingDateTable.slice(start, inclusive);
};

const snapToTradingDate = (date: string): string =>
  isTradingDate(date) ? date : getPreviousKrxTradingDate(date);

// ── 틱 · 상하한 ─────────────────
const roundTick = (p: number): number => {
  const t = getTickSize(p);
  return Math.round(p / t) * t;
};
const floorTick = (p: number): number => {
  const t = getTickSize(p);
  return Math.floor(p / t) * t;
};
const ceilTick = (p: number): number => {
  const t = getTickSize(p);
  return Math.ceil(p / t) * t;
};
const clampPrice = (p: number): number => Math.min(PRICE_MAX, Math.max(PRICE_MIN, p));

type Band = { lo: number; hi: number };
// 기준가 대비 ±30%. 틱 안쪽으로 내림·올림해야 경계값도 틱 배수가 된다.
const limitBand = (base: number): Band => ({
  lo: Math.max(PRICE_MIN, ceilTick(base * (1 - LIMIT_RATE))),
  hi: Math.min(PRICE_MAX, floorTick(base * (1 + LIMIT_RATE))),
});
const clampTo = (p: number, band: Band): number => Math.min(band.hi, Math.max(band.lo, p));

// 기준가 대비 상한가 · 하한가. 순위의 상 · 하한 판정이 같은 틱 규칙을 본다.
export const limitPrices = (basePrice: number): { lower: number; upper: number } => {
  const band = limitBand(basePrice);
  return { lower: band.lo, upper: band.hi };
};

// ── 시장 팩터 ─────────────────
// 같은 날 값을 모든 종목이 보므로 시장 · 날짜별로 한 번만 뽑는다.
const marketReturnMemo = new Map<DemoMarket, Map<string, number>>();

export const marketReturnDaily = (market: DemoMarket, date: string): number => {
  let byDate = marketReturnMemo.get(market);
  if (!byDate) {
    byDate = new Map();
    marketReturnMemo.set(market, byDate);
  }
  let r = byDate.get(date);
  if (r === undefined) {
    r = MARKET_SIGMA[market] * gaussian(createRng(hashSeed("market", market, date)));
    byDate.set(date, r);
  }
  return r;
};

// ── 프로필 ─────────────────
const pickTier = (u: number): DemoTier =>
  u < TIER_CUMULATIVE.large ? "large" : u < TIER_CUMULATIVE.mid ? "mid" : "small";

const ladderPrice = (anchor: DemoAnchor | null, uMultiple: number, uFallback: number): number => {
  const accept = (p: number | null): number | null =>
    p !== null && p >= LADDER_MIN && p <= LADDER_MAX ? p : null;
  // u² 로 낮은 배수 쪽에 치우치게 — 실제 PER·PBR 분포가 그렇다
  const skew = uMultiple * uMultiple;
  const eps = anchor?.eps ?? 0;
  const byEps = eps > 0 ? accept(roundTick(eps * (PER_MIN + PER_SPAN * skew))) : null;
  if (byEps !== null) return byEps;
  const bps = anchor?.bps ?? 0;
  const byBps = bps > 0 ? accept(roundTick(bps * (PBR_MIN + PBR_SPAN * skew))) : null;
  if (byBps !== null) return byBps;
  return roundTick(
    Math.exp(
      Math.log(FALLBACK_PRICE_MIN) +
        (Math.log(FALLBACK_PRICE_MAX) - Math.log(FALLBACK_PRICE_MIN)) * uFallback
    )
  );
};

// 핀은 거래일로 당기고(12-31 휴장) 앵커 이후는 버린다 — 앵커 이후 이력이 핀에 끌려 바뀌면 불변성이 깨진다.
const normalizePins = (pins: DemoPin[] | undefined): DemoPin[] => {
  if (!pins) return [];
  const byDate = new Map<string, number>();
  for (const pin of pins) {
    if (!(pin.price > 0) || pin.date > DEMO_ANCHOR_DATE) continue;
    byDate.set(snapToTradingDate(pin.date), clampPrice(roundTick(pin.price)));
  }
  return [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
};

const logLerp = (min: number, max: number, u: number): number =>
  Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * u);

const volumeScaleOf = (
  tier: DemoTier,
  shares: number | null,
  anchorPrice: number,
  uVolume: number
): number => {
  if (shares === null || !(shares > 0)) {
    const [min, max] = TIER_VOLUME[tier];
    return logLerp(min, max, uVolume);
  }
  const cap = shares * anchorPrice;
  const band =
    TURNOVER_BANDS.find((b) => cap >= b.minCap) ?? TURNOVER_BANDS[TURNOVER_BANDS.length - 1];
  return shares * logLerp(band.min, band.max, uVolume);
};

type PathProfile = Pick<TickerProfile, "sigma" | "beta" | "clusterPhase">;

export const getTickerProfile = (ticker: string, anchor: DemoAnchor | null): TickerProfile => {
  const rng = createRng(hashSeed(ticker, "profile"));
  const tier = pickTier(rng());
  const sigma =
    TIER_SIGMA[tier] * (SIGMA_JITTER_MIN + (SIGMA_JITTER_MAX - SIGMA_JITTER_MIN) * rng());
  const beta = TIER_BETA[tier] + (rng() * 2 - 1) * BETA_JITTER;
  // 거래량 몫은 이 자리에서 한 번만 뽑는다 — 기준값은 앵커 가격이 나온 뒤에 만들지만, 뒤의
  // 추첨(nxEligible · 앵커 · 군집)과 가격 경로는 shares 유무와 무관해야 한다.
  const uVolume = rng();
  const nxEligible = rng() < NX_ELIGIBLE_RATE;
  const uMultiple = rng();
  const uFallback = rng();
  const clusterPhase = rng() * 2 * Math.PI;
  const pins = normalizePins(anchor?.pins);
  const pathProfile: PathProfile = { sigma, beta, clusterPhase };
  const lastPin = pins[pins.length - 1];
  const anchorPrice = lastPin
    ? (walkForward(
        ticker,
        pathProfile,
        lastPin.price,
        listTradingDates(lastPin.date, DEMO_ANCHOR_DATE).slice(1),
        lastPin.price
      ).at(-1) ?? lastPin.price)
    : clampPrice(ladderPrice(anchor, uMultiple, uFallback));
  const volumeScale = volumeScaleOf(tier, anchor?.shares ?? null, anchorPrice, uVolume);
  return { tier, sigma, beta, volumeScale, nxEligible, anchorPrice, pins, clusterPhase };
};

// ── 일별 노이즈 ─────────────────
type DayNoise = {
  r: number;
  sigmaDay: number;
  zAfterClose: number;
  zGap: number;
  zHigh: number;
  zLow: number;
  zVolume: number;
};

const sigmaDayOf = (profile: PathProfile, date: string): number => {
  const dayIndex = dateToMs(date) / DAY_MS;
  const cluster =
    (Math.sin((2 * Math.PI * dayIndex) / CLUSTER_PERIOD_DAYS + profile.clusterPhase) + 1) / 2;
  return profile.sigma * (CLUSTER_FLOOR + CLUSTER_RANGE * cluster);
};

// 종가 경로는 r 만 쓴다 — dayNoise 와 같은 rng 의 첫 추첨이라 값이 같고 나머지 다섯 추첨을 건너뛴다.
const dayReturn = (ticker: string, profile: PathProfile, date: string): number => {
  const rng = createRng(hashSeed(ticker, date));
  return profile.beta * marketReturnDaily("KRX", date) + sigmaDayOf(profile, date) * gaussian(rng);
};

const dayNoise = (ticker: string, profile: PathProfile, date: string): DayNoise => {
  const rng = createRng(hashSeed(ticker, date));
  const sigmaDay = sigmaDayOf(profile, date);
  const r = profile.beta * marketReturnDaily("KRX", date) + sigmaDay * gaussian(rng);
  return {
    r,
    sigmaDay,
    zAfterClose: gaussian(rng),
    zGap: gaussian(rng),
    zHigh: gaussian(rng),
    zLow: gaussian(rng),
    zVolume: gaussian(rng),
  };
};

// ── 정규장 종가 경로 ─────────────────
const meanReversion = (price: number, level: number): number =>
  -MEAN_REVERSION_THETA * Math.log(price / level);

// dates 의 각 날 R. start 는 dates[0] 직전 거래일의 R. level 은 OU 항의 기준 수준.
const walkForward = (
  ticker: string,
  profile: PathProfile,
  start: number,
  dates: readonly string[],
  level: number
): number[] => {
  const out: number[] = [];
  let prev = start;
  for (const date of dates) {
    const r = dayReturn(ticker, profile, date);
    prev = clampPrice(
      clampTo(roundTick(prev * Math.exp(r + meanReversion(prev, level))), limitBand(prev))
    );
    out.push(prev);
  }
  return out;
};

// dates(오름차순) 의 각 날 R. end 는 dates 마지막 날 직후 거래일의 R. 역방향이라도 상하한은
// 순방향 관계(R(d) ∈ R(d-1) 의 ±30%)가 성립하도록 역으로 조이고, OU 항은 과거로 갈수록
// level 에서 멀어지지 않게(순방향과 같은 의미로) 건다.
const walkBackward = (
  ticker: string,
  profile: PathProfile,
  end: number,
  dates: readonly string[],
  level: number
): number[] => {
  const out: number[] = new Array(dates.length);
  let next = end;
  let nextDate = dates.length > 0 ? nextTradingDate(dates[dates.length - 1]) : "";
  for (let i = dates.length - 1; i >= 0; i--) {
    const r = dayReturn(ticker, profile, nextDate);
    const lo = Math.max(PRICE_MIN, ceilTick(next / (1 + LIMIT_RATE)));
    const hi = Math.min(PRICE_MAX, floorTick(next / (1 - LIMIT_RATE)));
    next = Math.min(hi, Math.max(lo, roundTick(next / Math.exp(r - meanReversion(next, level)))));
    out[i] = next;
    nextDate = dates[i];
  }
  return out;
};

const nextTradingDate = (date: string): string => {
  let t = dateToMs(date) + DAY_MS;
  while (!isTradingDate(msToDate(t))) t += DAY_MS;
  return msToDate(t);
};

// 브라운 브리지 — 자유 워크(로그)를 돌린 뒤 선형 보정으로 끝점을 end 에 맞춘다. 보정은
// 상하한 클램프 전에 적용하므로 하루 ±30% 를 넘는 보정이 필요한 극단에서만 끝점이 어긋난다.
const bridgeForward = (
  ticker: string,
  profile: PathProfile,
  start: number,
  end: number,
  dates: readonly string[]
): number[] => {
  const n = dates.length;
  if (n === 0) return [];
  const logs: number[] = new Array(n);
  let acc = Math.log(start);
  for (let i = 0; i < n; i++) {
    acc += dayReturn(ticker, profile, dates[i]);
    logs[i] = acc;
  }
  const correction = (Math.log(end) - logs[n - 1]) / n;
  const out: number[] = new Array(n);
  let prev = start;
  for (let i = 0; i < n; i++) {
    prev = clampPrice(
      clampTo(roundTick(Math.exp(logs[i] + correction * (i + 1))), limitBand(prev))
    );
    out[i] = prev;
  }
  return out;
};

// [from, to] 거래일 각각의 R. 고정점(핀 · 앵커) 사이는 브리지, 마지막 핀 → 앵커 → 이후는
// 자유 워크, 첫 고정점 이전은 역방향 워크. 요청 창과 겹치는 구간만 계산한다.
// 자유 워크의 OU 기준 수준은 그 방향의 마지막 핀(없으면 앵커) — 핀이 "실제 주가 수준" 이다.
const regularClosePath = (
  ticker: string,
  profile: TickerProfile,
  from: string,
  to: string
): Map<string, number> => {
  const out = new Map<string, number>();
  const anchorDate = snapToTradingDate(DEMO_ANCHOR_DATE);
  const fixed: DemoPin[] = [...profile.pins, { date: anchorDate, price: profile.anchorPrice }];
  const first = fixed[0];
  const lastPin = profile.pins[profile.pins.length - 1];
  const forwardLevel = lastPin ? lastPin.price : profile.anchorPrice;

  if (from < first.date) {
    const dates = listTradingDates(from, first.date).filter((d) => d < first.date);
    walkBackward(ticker, profile, first.price, dates, first.price).forEach((p, i) =>
      out.set(dates[i], p)
    );
  }
  for (const f of fixed) if (f.date >= from && f.date <= to) out.set(f.date, f.price);

  for (let i = 0; i + 1 < fixed.length; i++) {
    const a = fixed[i];
    const b = fixed[i + 1];
    if (b.date <= from || a.date >= to) continue;
    const dates = listTradingDates(a.date, b.date).slice(1);
    const isLastPinToAnchor = i === fixed.length - 2;
    const path = isLastPinToAnchor
      ? walkForward(ticker, profile, a.price, dates, forwardLevel)
      : bridgeForward(ticker, profile, a.price, b.price, dates);
    path.forEach((p, k) => {
      if (dates[k] >= from && dates[k] <= to) out.set(dates[k], p);
    });
  }

  if (to > anchorDate) {
    const dates = listTradingDates(anchorDate, to).slice(1);
    walkForward(ticker, profile, profile.anchorPrice, dates, forwardLevel).forEach((p, i) => {
      if (dates[i] >= from) out.set(dates[i], p);
    });
  }
  return out;
};

// ── 일봉 ─────────────────
const afterClose = (regularClose: number, noise: DayNoise, band: Band): number =>
  clampTo(
    roundTick(
      regularClose * Math.exp(AFTER_CLOSE_SIGMA_RATIO * noise.sigmaDay * noise.zAfterClose)
    ),
    band
  );

const buildDailyBar = (
  ticker: string,
  profile: TickerProfile,
  date: string,
  regularClose: number,
  prevRegularClose: number,
  prevClose: number
): DemoDailyBar => {
  const noise = dayNoise(ticker, profile, date);
  const band = limitBand(prevRegularClose);
  const close = afterClose(regularClose, noise, band);
  const open = clampTo(
    roundTick(prevClose * Math.exp(GAP_SIGMA_RATIO * noise.sigmaDay * noise.zGap)),
    band
  );
  const hiBase = Math.max(open, regularClose, close);
  const loBase = Math.min(open, regularClose, close);
  const high = clampTo(
    ceilTick(hiBase * (1 + WICK_SIGMA_RATIO * noise.sigmaDay * Math.abs(noise.zHigh))),
    band
  );
  const low = clampTo(
    floorTick(loBase * (1 - WICK_SIGMA_RATIO * noise.sigmaDay * Math.abs(noise.zLow))),
    band
  );
  const volume = Math.max(
    1,
    Math.round(
      profile.volumeScale *
        Math.exp(VOLUME_LOGNORMAL_SIGMA * noise.zVolume) *
        (1 + (VOLUME_RETURN_BOOST * Math.abs(noise.r)) / noise.sigmaDay)
    )
  );
  return { date, open, high, low, close, volume, regularClose, basePrice: prevRegularClose };
};

export const generateDailyBars = (
  ticker: string,
  profile: TickerProfile,
  from: string,
  to: string
): DemoDailyBar[] => {
  const dates = listTradingDates(from, to);
  if (dates.length === 0) return [];
  // 시가는 전일 20:00 종가에서 갭, 전일 20:00 종가는 전전일 기준 상하한 안 — 두 날 앞까지 필요하다.
  const prev1 = getPreviousKrxTradingDate(dates[0]);
  const prev2 = getPreviousKrxTradingDate(prev1);
  const path = regularClosePath(ticker, profile, prev2, to);
  const r = (d: string): number => path.get(d) as number;
  let prevDate = prev1;
  let prevClose = afterClose(r(prev1), dayNoise(ticker, profile, prev1), limitBand(r(prev2)));
  return dates.map((date) => {
    const bar = buildDailyBar(ticker, profile, date, r(date), r(prevDate), prevClose);
    prevDate = date;
    prevClose = bar.close;
    return bar;
  });
};

export const getDailyBar = (ticker: string, profile: TickerProfile, date: string): DemoDailyBar => {
  const d = snapToTradingDate(date);
  return generateDailyBars(ticker, profile, d, d)[0];
};

// ── 분봉 ─────────────────
// KST 벽시계를 UTC 로 위장한 epoch 초 (IndexIntradaySnapshot 관례, START 라벨).
const kstFakeUtcSec = (date: string, minuteOfDay: number): number =>
  dateToMs(date) / 1000 + minuteOfDay * MINUTE_SEC;

// 로그 랜덤워크 n 스텝 후 선형 보정으로 끝점을 end 에 고정. 반환은 각 봉의 종가(반올림 전).
const minuteBridge = (
  gauss: () => number,
  start: number,
  end: number,
  n: number,
  sigmaMinute: number
): number[] => {
  const closes: number[] = new Array(n);
  let acc = Math.log(start);
  for (let i = 0; i < n; i++) {
    acc += sigmaMinute * gauss();
    closes[i] = acc;
  }
  const correction = (Math.log(end) - closes[n - 1]) / n;
  for (let i = 0; i < n; i++) closes[i] = Math.exp(closes[i] + correction * (i + 1));
  return closes;
};

// 시가–종가 현(chord) 위쪽 초과분의 최대가 정확히 high, 아래쪽이 low 가 되게 선형 스케일.
// 최소 비율을 고르므로 어떤 봉도 [low, high] 를 넘지 않는다.
// 끝 노드는 브리지가 end 에 고정한 현 위의 점이라 대상이 아니다 — 부동소수 오차로 남은 초과를 잡으면
// 한쪽에만 머문 경로에서 끝 노드가 고저로 튄다.
const fitHighLow = (
  closes: number[],
  start: number,
  end: number,
  high: number,
  low: number
): void => {
  const n = closes.length;
  const step = (end - start) / n;
  let scaleUp = Infinity;
  let scaleDown = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const chord = start + step * (i + 1);
    const excess = closes[i] - chord;
    if (excess > 0) scaleUp = Math.min(scaleUp, (high - chord) / excess);
    else if (excess < 0) scaleDown = Math.min(scaleDown, (chord - low) / -excess);
  }
  for (let i = 0; i < n - 1; i++) {
    const chord = start + step * (i + 1);
    const excess = closes[i] - chord;
    if (excess > 0 && Number.isFinite(scaleUp)) closes[i] = chord + excess * scaleUp;
    else if (excess < 0 && Number.isFinite(scaleDown)) closes[i] = chord + excess * scaleDown;
  }
  // 전 구간이 현의 한쪽에만 머문 극단(수백 스텝에서 사실상 없음)에도 일봉 고저와 어긋나지 않게 한다.
  if (!Number.isFinite(scaleUp)) closes[Math.floor(n / 3)] = high;
  if (!Number.isFinite(scaleDown)) closes[Math.floor((2 * n) / 3)] = low;
};

// U자 프로파일 × lognormal, 합이 total 이 되게 정수 배분. auction 이면 개장 직후 봉들과 마지막(종가 단일가)
// 봉의 결정 가중치를 나머지 봉 평균의 배수로 바꾼다.
const allocateVolume = (
  gauss: () => number,
  n: number,
  total: number,
  auction: boolean
): number[] => {
  const weights: number[] = new Array(n);
  const half = Math.max(1, (n - 1) / 2);
  for (let i = 0; i < n; i++) {
    const x = (i - half) / half;
    weights[i] = 1 + U_PROFILE_DEPTH * x * x;
  }
  if (auction) {
    const openBars = OPEN_SPIKE_WEIGHTS.length;
    let plain = 0;
    for (let i = openBars; i < n - 1; i++) plain += weights[i];
    const mean = plain / (n - 1 - openBars);
    for (let i = 0; i < openBars; i++) weights[i] = OPEN_SPIKE_WEIGHTS[i] * mean;
    weights[n - 1] = CLOSE_AUCTION_WEIGHT * mean;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    weights[i] *= Math.exp(MINUTE_VOLUME_LOGNORMAL_SIGMA * gauss());
    sum += weights[i];
  }
  const out: number[] = new Array(n);
  let allocated = 0;
  let heaviest = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.floor((total * weights[i]) / sum);
    allocated += out[i];
    if (weights[i] > weights[heaviest]) heaviest = i;
  }
  out[heaviest] += total - allocated;
  return out;
};

// 단일가 체결 직전의 마지막 체결가 — 단일가에서 로그로 sigma × 정규 추첨만큼 벌어진 값. 일봉 고저를 넘지 않는다.
const lastTradeBeforeAuction = (
  ticker: string,
  date: string,
  auction: "open-auction" | "close-auction",
  auctionPrice: number,
  sigma: number,
  band: Band
): number => {
  const z = gaussian(createRng(hashSeed(ticker, date, auction)));
  return clampTo(roundTick(auctionPrice * Math.exp(sigma * z)), band);
};

type Segment = {
  name: "pre" | "regular" | "after";
  startMin: number;
  endMin: number; // 포함
  start: number;
  end: number;
  sigmaRatio: number;
  volume: number;
  fit: boolean;
  // 종가 단일가로 끝나는 구간 — 접수 창에는 봉이 없고 endMin 봉은 체결가(end) 하나다
  closeAuction: boolean;
};

const buildSegmentBars = (
  ticker: string,
  date: string,
  dayStartSec: number,
  seg: Segment,
  band: Band,
  sigmaDay: number
): DemoMinuteBar[] => {
  const rng = createRng(hashSeed(ticker, date, seg.name));
  const gauss = createGaussian(rng);
  // 연속 체결 봉 수. 종가 단일가 구간은 접수 창 직전(15:19)까지만 걷고 단일가 봉 하나를 따로 붙인다 —
  // 경로를 단일가(R)가 아니라 그 근처(R')에 묶어야 15:19 종가와 단일가의 차이가 고저 맞춤으로 커지지 않는다.
  const steps = (seg.closeAuction ? CLOSE_CALL_START_MIN - 1 : seg.endMin) - seg.startMin + 1;
  const n = seg.closeAuction ? steps + 1 : steps;
  const sigmaMinute = (sigmaDay * seg.sigmaRatio) / Math.sqrt(n);
  const pathEnd = seg.closeAuction
    ? lastTradeBeforeAuction(ticker, date, "close-auction", seg.end, CLOSE_AUCTION_SIGMA, band)
    : seg.end;
  const closes = minuteBridge(gauss, seg.start, pathEnd, steps, sigmaMinute);
  if (seg.fit) fitHighLow(closes, seg.start, pathEnd, band.hi, band.lo);
  const volumes = allocateVolume(gauss, n, seg.volume, seg.closeAuction);
  const bars: DemoMinuteBar[] = new Array(n);
  const firstSec = dayStartSec + seg.startMin * MINUTE_SEC;
  // 단일가 체결은 가격이 하나다 — 직전 봉 종가에서 이어지지 않고 wick 도 없다.
  if (seg.closeAuction) {
    bars[steps] = {
      timestamp: dayStartSec + seg.endMin * MINUTE_SEC,
      open: seg.end,
      high: seg.end,
      low: seg.end,
      close: seg.end,
      volume: volumes[steps],
    };
  }
  let open = seg.start;
  for (let i = 0; i < steps; i++) {
    const close = clampTo(roundTick(closes[i]), band);
    const wick = MINUTE_WICK_RATIO * sigmaMinute * rng();
    const hi = open > close ? open : close;
    const lo = open > close ? close : open;
    bars[i] = {
      timestamp: firstSec + i * MINUTE_SEC,
      open,
      high: clampTo(ceilTick(hi * (1 + wick)), band),
      low: clampTo(floorTick(lo * (1 - wick)), band),
      close,
      volume: volumes[i],
    };
    open = close;
  }
  return bars;
};

// 하루 전체(UN) 경로를 만든 뒤 채널로 자른다 — J 는 08:00~09:00 · 15:40~15:59 제외, NX 는 비적격이면 null
// (route 가 NX 채널의 null 을 "NXT 미취급 종목" 신호로 쓴다). NX 봉은 UN 봉 그대로다 — 차트는 UN · J 만
// 쓰고, NXT 가 통합가와 벌어지는 것은 현재가(quoteAt)와 마감 스냅샷의 NXT 종가뿐이다.
// 프리마켓은 시가에서 출발해 시가 근처에서 끝나는 브리지 — 전일 20:00 종가에서 출발하면 UN 첫 봉의
// 시가가 일봉 시가와 어긋나고 전일 종가가 당일 고저 밖에 놓일 수 있다. 갭은 08:00 에 한 번에 생긴다.
// 봉 사이가 끊기는 곳은 단일가 두 번뿐이다 — 08:49 종가 → 09:00 시가(O), 15:19 종가 → 15:30 체결(R).
// untilMin 이후에 시작하는 구간은 만들지 않는다 — 현재가는 지나간 봉만 필요하고 구간은 서로 독립이다.
const buildIntradayBars = (
  ticker: string,
  profile: TickerProfile,
  date: string,
  today: DemoDailyBar,
  channel: DemoChannel,
  untilMin: number
): DemoMinuteBar[] => {
  const nxt = profile.nxEligible;
  const { sigmaDay } = dayNoise(ticker, profile, date);
  const band: Band = { lo: today.low, hi: today.high };
  const afterVolume = Math.round(today.volume * AFTER_VOLUME_SHARE);
  const preVolume = nxt ? Math.round(today.volume * PRE_VOLUME_SHARE) : 0;
  const hasPre = nxt && channel !== "J";
  const pre: Segment[] = hasPre
    ? [
        {
          name: "pre",
          startMin: PRE_START_MIN,
          endMin: PRE_END_MIN,
          start: today.open,
          end: lastTradeBeforeAuction(
            ticker,
            date,
            "open-auction",
            today.open,
            OPEN_AUCTION_SIGMA,
            band
          ),
          sigmaRatio: PRE_SIGMA_RATIO,
          volume: preVolume,
          fit: false,
          closeAuction: false,
        },
      ]
    : [];
  const segments: Segment[] = [
    ...pre,
    {
      name: "regular",
      startMin: REGULAR_START_MIN,
      endMin: REGULAR_END_MIN,
      start: today.open,
      end: today.regularClose,
      sigmaRatio: 1,
      volume: today.volume - afterVolume - preVolume,
      fit: true,
      closeAuction: true,
    },
    {
      name: "after",
      startMin: nxt ? NXT_AFTER_START_MIN : KRX_AFTER_START_MIN,
      endMin: AFTER_END_MIN,
      start: today.regularClose,
      end: today.close,
      sigmaRatio: AFTER_SIGMA_RATIO,
      volume: afterVolume,
      fit: false,
      closeAuction: false,
    },
  ];
  const dayStartSec = kstFakeUtcSec(date, 0);
  const bars = segments
    .filter((seg) => seg.startMin <= untilMin)
    .flatMap((seg) => buildSegmentBars(ticker, date, dayStartSec, seg, band, sigmaDay));
  if (channel !== "J" || !nxt) return bars;
  // J 는 NXT 종목도 KRX 일정 — 경로는 UN 과 같고 NXT 애프터 단독 구간(15:40~15:59)만 뺀다
  const hideFrom = dayStartSec + NXT_AFTER_START_MIN * MINUTE_SEC;
  const hideUntil = dayStartSec + KRX_AFTER_START_MIN * MINUTE_SEC;
  return bars.filter((b) => b.timestamp < hideFrom || b.timestamp >= hideUntil);
};

export const generateIntradayBars = (
  ticker: string,
  profile: TickerProfile,
  date: string,
  prev: DemoDailyBar,
  today: DemoDailyBar,
  channel: DemoChannel
): DemoMinuteBar[] | null => {
  if (channel === "NX" && !profile.nxEligible) return null;
  return buildIntradayBars(ticker, profile, date, today, channel, Number.POSITIVE_INFINITY);
};

// ── NXT 가격 ─────────────────
// 경로는 통합(UN) 하나라 NXT 가격은 통합가에서 틱 몇 개 떨어진 값으로 만든다. 두 시장이 동시에 체결되는
// 봉에서만 벌어진다 — NXT 단독 구간(프리마켓 · 15:40~15:59)은 통합가가 곧 NXT 가이고 15:30 봉은 KRX
// 종가 단일가 하나다.
const NX_SPREAD_CUMULATIVE = [0.35, 0.75, 0.95] as const; // |틱 수| 0 · 1 · 2 의 누적 확률, 나머지는 3

const tradesOnBothMarkets = (minuteOfDay: number): boolean =>
  (minuteOfDay >= REGULAR_START_MIN && minuteOfDay < CLOSE_CALL_START_MIN) ||
  (minuteOfDay >= KRX_AFTER_START_MIN && minuteOfDay <= AFTER_END_MIN);

// 분마다 별도 시드 스트림에서 뽑는다 — 경로 추첨을 건드리지 않고 같은 분엔 같은 값이다.
const nxSpreadTicks = (ticker: string, date: string, minuteOfDay: number): number => {
  if (!tradesOnBothMarkets(minuteOfDay)) return 0;
  const rng = createRng(hashSeed(ticker, date, "nx-spread", minuteOfDay));
  const u = rng();
  const size = NX_SPREAD_CUMULATIVE.findIndex((cumulative) => u < cumulative);
  const ticks = size === -1 ? NX_SPREAD_CUMULATIVE.length : size;
  return rng() < 0.5 ? -ticks : ticks;
};

// 호가 단위가 바뀌는 경계를 한 칸씩 넘는다 — 49,950 의 위 칸은 50,000, 그 위 칸은 50,100.
// 아래 칸의 호가 단위는 지금 가격 바로 밑 구간의 것이다(50,000 의 아래 칸은 49,950).
export const stepTicks = (price: number, ticks: number): number => {
  let p = price;
  for (let i = Math.abs(ticks); i > 0; i--) p += ticks > 0 ? getTickSize(p) : -getTickSize(p - 1);
  return p;
};

// minuteOfDay 는 "지금" 이 아니라 마지막으로 체결된 봉의 분 — 봉이 없는 15:20~15:29 엔 15:19 값이 남는다.
// 당일 고저로는 조이지 않는다 — NXT 는 KRX 고저 밖에서도 체결된다.
const nxPriceAt = (
  ticker: string,
  date: string,
  minuteOfDay: number,
  unPrice: number,
  basePrice: number
): number =>
  clampTo(stepTicks(unPrice, nxSpreadTicks(ticker, date, minuteOfDay)), limitBand(basePrice));

// 20:00 마감 봉의 NXT 종가 — 마감 뒤의 NX 현재가(quoteAt)와 같은 값이다.
export const nxCloseOf = (ticker: string, bar: DemoDailyBar): number =>
  nxPriceAt(ticker, bar.date, AFTER_END_MIN, bar.close, bar.basePrice ?? bar.regularClose);

// ── 현재가 ─────────────────
const toSign = (change: number): PriceSign => (change > 0 ? "up" : change < 0 ? "down" : "flat");

export const quoteAt = (
  ticker: string,
  profile: TickerProfile,
  now: Date,
  channel: DemoChannel
): StockQuote | null => {
  if (channel === "NX" && !profile.nxEligible) return null;
  const tradingDate = getKrxTradingDate(now);
  const prevDate = getPreviousKrxTradingDate(tradingDate);
  const [prev, today] = generateDailyBars(ticker, profile, prevDate, tradingDate);
  const { date, minutes } = getKstDateAndMinutes(now);
  // 거래일이 오늘이면 진행 중인 봉까지 보인다(차트 마지막 봉 = 헤더). 지난 거래일이면 하루 전체.
  const untilMin = date === tradingDate ? minutes : Number.POSITIVE_INFINITY;
  const bars = buildIntradayBars(ticker, profile, tradingDate, today, channel, untilMin);
  const cutoffSec = kstFakeUtcSec(tradingDate, untilMin);
  const basePrice = prev.regularClose;
  let price = basePrice;
  let open = 0;
  let high = 0;
  let low = 0;
  let volume = 0;
  let seen = false;
  let lastSec = 0;
  // 오늘 봉이 하나도 없는 개장 전 창(J, NXT 미취급 UN 의 08:00~09:00)은 실제 J quote 처럼 전일 정규장
  // 종가 · 등락 0 + OHL 0 — 08:00 에 기준가가 오늘로 리셋되고 KRX 체결은 09:00 부터다.
  // 소비측(mergeLiveDayBar 등)이 OHL 0 을 "당일 체결 없음" 으로 읽는다.
  for (const bar of bars) {
    if (bar.timestamp > cutoffSec) break;
    if (!seen) {
      seen = true;
      open = bar.open;
      high = bar.high;
      low = bar.low;
    } else {
      high = Math.max(high, bar.high);
      low = Math.min(low, bar.low);
    }
    price = bar.close;
    volume += bar.volume;
    lastSec = bar.timestamp;
  }
  if (channel === "NX" && seen) {
    const lastMin = (lastSec - kstFakeUtcSec(tradingDate, 0)) / MINUTE_SEC;
    price = nxPriceAt(ticker, tradingDate, lastMin, price, basePrice);
    // 고저는 통합 봉에서 모은 값이라 NXT 가격이 그 밖일 수 있다 — price 가 [low, high] 안에 들도록 넓힌다
    high = Math.max(high, price);
    low = Math.min(low, price);
  }
  const change = price - basePrice;
  return {
    ticker,
    price,
    change,
    changeRate: Math.round((change / basePrice) * 10000) / 100,
    sign: toSign(change),
    open,
    high,
    low,
    volume,
  };
};
