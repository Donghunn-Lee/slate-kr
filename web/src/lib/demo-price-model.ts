import { getTickSize } from "./get-tick-size";
import { createGaussian, createRng, gaussian, hashSeed, logUniform } from "./demo-prng";
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
const TIER_CUMULATIVE = { large: 0.1, mid: 0.4 } as const; // small = 나머지 60%
const TIER_SIGMA: Record<DemoTier, number> = { large: 0.012, mid: 0.02, small: 0.032 };
const TIER_BETA: Record<DemoTier, number> = { large: 0.9, mid: 1.0, small: 1.2 };
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
const REGULAR_START_MIN = 9 * 60;
const REGULAR_END_MIN = 15 * 60 + 30; // 15:30 마감 단일가 봉 포함
const NXT_AFTER_START_MIN = 15 * 60 + 31;
const KRX_AFTER_START_MIN = 16 * 60;
const AFTER_END_MIN = 20 * 60; // 20:00 봉 포함
const PRE_SIGMA_RATIO = 0.3;
const AFTER_SIGMA_RATIO = 0.4;
const MINUTE_WICK_RATIO = 0.5;
const PRE_VOLUME_SHARE = 0.03;
const AFTER_VOLUME_SHARE = 0.05;
const U_PROFILE_DEPTH = 2;
const MINUTE_VOLUME_LOGNORMAL_SIGMA = 0.5;

const DAY_MS = 86_400_000;
const MINUTE_SEC = 60;

// ── 달력 ─────────────────
const pad2 = (n: number): string => String(n).padStart(2, "0");
const dateToMs = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const msToDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};
const isTradingDate = (date: string): boolean => {
  const dow = new Date(dateToMs(date)).getUTCDay();
  return dow !== 0 && dow !== 6 && !isKrxHoliday(date);
};

export const listTradingDates = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = dateToMs(from); t <= dateToMs(to); t += DAY_MS) {
    const date = msToDate(t);
    if (isTradingDate(date)) out.push(date);
  }
  return out;
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

// ── 시장 팩터 ─────────────────
export const marketReturnDaily = (market: DemoMarket, date: string): number =>
  MARKET_SIGMA[market] * gaussian(createRng(hashSeed("market", market, date)));

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
        (Math.log(FALLBACK_PRICE_MAX) - Math.log(FALLBACK_PRICE_MIN)) * uFallback,
    ),
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

type PathProfile = Pick<TickerProfile, "sigma" | "beta" | "clusterPhase">;

export const getTickerProfile = (ticker: string, anchor: DemoAnchor | null): TickerProfile => {
  const rng = createRng(hashSeed(ticker, "profile"));
  const tier = pickTier(rng());
  const sigma =
    TIER_SIGMA[tier] * (SIGMA_JITTER_MIN + (SIGMA_JITTER_MAX - SIGMA_JITTER_MIN) * rng());
  const beta = TIER_BETA[tier] + (rng() * 2 - 1) * BETA_JITTER;
  const [volMin, volMax] = TIER_VOLUME[tier];
  const volumeScale = logUniform(rng, volMin, volMax);
  const nxEligible = rng() < NX_ELIGIBLE_RATE;
  const uMultiple = rng();
  const uFallback = rng();
  const clusterPhase = rng() * 2 * Math.PI;
  const pins = normalizePins(anchor?.pins);
  const pathProfile: PathProfile = { sigma, beta, clusterPhase };
  const lastPin = pins[pins.length - 1];
  const anchorPrice = lastPin
    ? walkForward(ticker, pathProfile, lastPin.price, listTradingDates(lastPin.date, DEMO_ANCHOR_DATE).slice(1)).at(-1) ?? lastPin.price
    : clampPrice(ladderPrice(anchor, uMultiple, uFallback));
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

const dayNoise = (ticker: string, profile: PathProfile, date: string): DayNoise => {
  const rng = createRng(hashSeed(ticker, date));
  const dayIndex = dateToMs(date) / DAY_MS;
  const cluster =
    (Math.sin((2 * Math.PI * dayIndex) / CLUSTER_PERIOD_DAYS + profile.clusterPhase) + 1) / 2;
  const sigmaDay = profile.sigma * (CLUSTER_FLOOR + CLUSTER_RANGE * cluster);
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
// dates 의 각 날 R. start 는 dates[0] 직전 거래일의 R.
const walkForward = (
  ticker: string,
  profile: PathProfile,
  start: number,
  dates: readonly string[],
): number[] => {
  const out: number[] = [];
  let prev = start;
  for (const date of dates) {
    const { r } = dayNoise(ticker, profile, date);
    prev = clampPrice(clampTo(roundTick(prev * Math.exp(r)), limitBand(prev)));
    out.push(prev);
  }
  return out;
};

// dates(오름차순) 의 각 날 R. end 는 dates 마지막 날 직후 거래일의 R. 역방향이라도 상하한은
// 순방향 관계(R(d) ∈ R(d-1) 의 ±30%)가 성립하도록 역으로 조인다.
const walkBackward = (
  ticker: string,
  profile: PathProfile,
  end: number,
  dates: readonly string[],
): number[] => {
  const out: number[] = new Array(dates.length);
  let next = end;
  let nextDate = dates.length > 0 ? nextTradingDate(dates[dates.length - 1]) : "";
  for (let i = dates.length - 1; i >= 0; i--) {
    const { r } = dayNoise(ticker, profile, nextDate);
    const lo = Math.max(PRICE_MIN, ceilTick(next / (1 + LIMIT_RATE)));
    const hi = Math.min(PRICE_MAX, floorTick(next / (1 - LIMIT_RATE)));
    next = Math.min(hi, Math.max(lo, roundTick(next / Math.exp(r))));
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
  dates: readonly string[],
): number[] => {
  const n = dates.length;
  if (n === 0) return [];
  const logs: number[] = new Array(n);
  let acc = Math.log(start);
  for (let i = 0; i < n; i++) {
    acc += dayNoise(ticker, profile, dates[i]).r;
    logs[i] = acc;
  }
  const correction = (Math.log(end) - logs[n - 1]) / n;
  const out: number[] = new Array(n);
  let prev = start;
  for (let i = 0; i < n; i++) {
    prev = clampPrice(clampTo(roundTick(Math.exp(logs[i] + correction * (i + 1))), limitBand(prev)));
    out[i] = prev;
  }
  return out;
};

// [from, to] 거래일 각각의 R. 고정점(핀 · 앵커) 사이는 브리지, 마지막 핀 → 앵커 → 이후는
// 자유 워크, 첫 고정점 이전은 역방향 워크. 요청 창과 겹치는 구간만 계산한다.
const regularClosePath = (
  ticker: string,
  profile: TickerProfile,
  from: string,
  to: string,
): Map<string, number> => {
  const out = new Map<string, number>();
  const anchorDate = snapToTradingDate(DEMO_ANCHOR_DATE);
  const fixed: DemoPin[] = [...profile.pins, { date: anchorDate, price: profile.anchorPrice }];
  const first = fixed[0];

  if (from < first.date) {
    const dates = listTradingDates(from, first.date).filter((d) => d < first.date);
    walkBackward(ticker, profile, first.price, dates).forEach((p, i) => out.set(dates[i], p));
  }
  for (const f of fixed) if (f.date >= from && f.date <= to) out.set(f.date, f.price);

  for (let i = 0; i + 1 < fixed.length; i++) {
    const a = fixed[i];
    const b = fixed[i + 1];
    if (b.date <= from || a.date >= to) continue;
    const dates = listTradingDates(a.date, b.date).slice(1);
    const isLastPinToAnchor = i === fixed.length - 2;
    const path = isLastPinToAnchor
      ? walkForward(ticker, profile, a.price, dates)
      : bridgeForward(ticker, profile, a.price, b.price, dates);
    path.forEach((p, k) => {
      if (dates[k] >= from && dates[k] <= to) out.set(dates[k], p);
    });
  }

  if (to > anchorDate) {
    const dates = listTradingDates(anchorDate, to).slice(1);
    walkForward(ticker, profile, profile.anchorPrice, dates).forEach((p, i) => {
      if (dates[i] >= from) out.set(dates[i], p);
    });
  }
  return out;
};

// ── 일봉 ─────────────────
const afterClose = (regularClose: number, noise: DayNoise, band: Band): number =>
  clampTo(
    roundTick(regularClose * Math.exp(AFTER_CLOSE_SIGMA_RATIO * noise.sigmaDay * noise.zAfterClose)),
    band,
  );

const buildDailyBar = (
  ticker: string,
  profile: TickerProfile,
  date: string,
  regularClose: number,
  prevRegularClose: number,
  prevClose: number,
): DemoDailyBar => {
  const noise = dayNoise(ticker, profile, date);
  const band = limitBand(prevRegularClose);
  const close = afterClose(regularClose, noise, band);
  const open = clampTo(
    roundTick(prevClose * Math.exp(GAP_SIGMA_RATIO * noise.sigmaDay * noise.zGap)),
    band,
  );
  const hiBase = Math.max(open, regularClose, close);
  const loBase = Math.min(open, regularClose, close);
  const high = clampTo(
    ceilTick(hiBase * (1 + WICK_SIGMA_RATIO * noise.sigmaDay * Math.abs(noise.zHigh))),
    band,
  );
  const low = clampTo(
    floorTick(loBase * (1 - WICK_SIGMA_RATIO * noise.sigmaDay * Math.abs(noise.zLow))),
    band,
  );
  const volume = Math.max(
    1,
    Math.round(
      profile.volumeScale *
        Math.exp(VOLUME_LOGNORMAL_SIGMA * noise.zVolume) *
        (1 + (VOLUME_RETURN_BOOST * Math.abs(noise.r)) / noise.sigmaDay),
    ),
  );
  return { date, open, high, low, close, volume, regularClose, basePrice: prevRegularClose };
};

export const generateDailyBars = (
  ticker: string,
  profile: TickerProfile,
  from: string,
  to: string,
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
  sigmaMinute: number,
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
const fitHighLow = (closes: number[], start: number, end: number, high: number, low: number): void => {
  const n = closes.length;
  const step = (end - start) / n;
  let scaleUp = Infinity;
  let scaleDown = Infinity;
  for (let i = 0; i < n; i++) {
    const chord = start + step * (i + 1);
    const excess = closes[i] - chord;
    if (excess > 0) scaleUp = Math.min(scaleUp, (high - chord) / excess);
    else if (excess < 0) scaleDown = Math.min(scaleDown, (chord - low) / -excess);
  }
  for (let i = 0; i < n; i++) {
    const chord = start + step * (i + 1);
    const excess = closes[i] - chord;
    if (excess > 0 && Number.isFinite(scaleUp)) closes[i] = chord + excess * scaleUp;
    else if (excess < 0 && Number.isFinite(scaleDown)) closes[i] = chord + excess * scaleDown;
  }
  // 전 구간이 현의 한쪽에만 머문 극단(수백 스텝에서 사실상 없음)에도 일봉 고저와 어긋나지 않게 한다.
  if (!Number.isFinite(scaleUp)) closes[Math.floor(n / 3)] = high;
  if (!Number.isFinite(scaleDown)) closes[Math.floor((2 * n) / 3)] = low;
};

// U자 프로파일 × lognormal, 합이 total 이 되게 정수 배분.
const allocateVolume = (gauss: () => number, n: number, total: number): number[] => {
  const weights: number[] = new Array(n);
  const half = Math.max(1, (n - 1) / 2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = (i - half) / half;
    weights[i] =
      (1 + U_PROFILE_DEPTH * x * x) * Math.exp(MINUTE_VOLUME_LOGNORMAL_SIGMA * gauss());
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

type Segment = {
  name: "pre" | "regular" | "after";
  startMin: number;
  endMin: number; // 포함
  start: number;
  end: number;
  sigmaRatio: number;
  volume: number;
  fit: boolean;
};

const buildSegmentBars = (
  ticker: string,
  date: string,
  dayStartSec: number,
  seg: Segment,
  band: Band,
  sigmaDay: number,
): DemoMinuteBar[] => {
  const rng = createRng(hashSeed(ticker, date, seg.name));
  const gauss = createGaussian(rng);
  const n = seg.endMin - seg.startMin + 1;
  const sigmaMinute = (sigmaDay * seg.sigmaRatio) / Math.sqrt(n);
  const closes = minuteBridge(gauss, seg.start, seg.end, n, sigmaMinute);
  if (seg.fit) fitHighLow(closes, seg.start, seg.end, band.hi, band.lo);
  const volumes = allocateVolume(gauss, n, seg.volume);
  const bars: DemoMinuteBar[] = new Array(n);
  const firstSec = dayStartSec + seg.startMin * MINUTE_SEC;
  let open = seg.start;
  for (let i = 0; i < n; i++) {
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

// 하루 전체(UN) 경로를 만든 뒤 채널로 자른다 — J 는 08:00~09:00 제외, NX 는 비적격이면 null
// (KIS 가 비NXT 종목에 NX 로 null 을 주던 동작을 route 가 기대한다).
// 프리마켓은 시가에서 출발해 시가로 돌아오는 브리지 — 전일 20:00 종가에서 출발하면 UN 첫 봉의
// 시가가 일봉 시가와 어긋나고 전일 종가가 당일 고저 밖에 놓일 수 있다. 갭은 08:00 에 한 번에 생긴다.
// untilMin 이후에 시작하는 구간은 만들지 않는다 — 현재가는 지나간 봉만 필요하고 구간은 서로 독립이다.
const buildIntradayBars = (
  ticker: string,
  profile: TickerProfile,
  date: string,
  today: DemoDailyBar,
  channel: DemoChannel,
  untilMin: number,
): DemoMinuteBar[] => {
  const nxt = profile.nxEligible;
  const { sigmaDay } = dayNoise(ticker, profile, date);
  const band: Band = { lo: today.low, hi: today.high };
  const afterVolume = Math.round(today.volume * AFTER_VOLUME_SHARE);
  const preVolume = nxt ? Math.round(today.volume * PRE_VOLUME_SHARE) : 0;
  const segments: Segment[] = [
    {
      name: "pre",
      startMin: PRE_START_MIN,
      endMin: REGULAR_START_MIN - 1,
      start: today.open,
      end: today.open,
      sigmaRatio: PRE_SIGMA_RATIO,
      volume: preVolume,
      fit: false,
    },
    {
      name: "regular",
      startMin: REGULAR_START_MIN,
      endMin: REGULAR_END_MIN,
      start: today.open,
      end: today.regularClose,
      sigmaRatio: 1,
      volume: today.volume - afterVolume - preVolume,
      fit: true,
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
    },
  ];
  const dayStartSec = kstFakeUtcSec(date, 0);
  const hasPre = nxt && channel !== "J";
  return segments
    .filter((seg) => (seg.name !== "pre" || hasPre) && seg.startMin <= untilMin)
    .flatMap((seg) => buildSegmentBars(ticker, date, dayStartSec, seg, band, sigmaDay));
};

export const generateIntradayBars = (
  ticker: string,
  profile: TickerProfile,
  date: string,
  prev: DemoDailyBar,
  today: DemoDailyBar,
  channel: DemoChannel,
): DemoMinuteBar[] | null => {
  if (channel === "NX" && !profile.nxEligible) return null;
  return buildIntradayBars(ticker, profile, date, today, channel, Number.POSITIVE_INFINITY);
};

// ── 현재가 ─────────────────
const toSign = (change: number): PriceSign => (change > 0 ? "up" : change < 0 ? "down" : "flat");

export const quoteAt = (
  ticker: string,
  profile: TickerProfile,
  now: Date,
  channel: DemoChannel,
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
  let price = prev.close;
  let open = 0;
  let high = 0;
  let low = 0;
  let volume = 0;
  let seen = false;
  // 오늘 봉이 하나도 없는 개장 전 창은 KIS 처럼 전일 종가 + OHL 0.
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
