import {
  getIndexMeta,
  INDICES_WITHOUT_VOLUME,
  OVERSEAS_INDEX_CLOSE_LOCAL,
  OVERSEAS_INDEX_DELAY_MIN,
  OVERSEAS_INDEX_MARKET,
  OVERSEAS_INDEX_OPEN_LOCAL,
  OVERSEAS_INDEX_TIMEZONE,
  type IndexCode,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import {
  getKrxTradingDate,
  getKstDateAndMinutes,
  getOverseasIndexTradingDate,
  getPreviousKrxTradingDate,
  getPreviousOverseasIndexTradingDate,
  isOverseasIndexHoliday,
} from "@/shared/utils/market";
import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
  IndexQuote,
  PriceSign,
} from "@/shared/types/quote";
import { createRng, gaussian, hashSeed } from "./demo-prng";
import {
  DEMO_ANCHOR_DATE,
  listTradingDates,
  marketReturnDaily,
  type DemoMarket,
} from "./demo-price-model";

// 가상 지수 시세. 종목과 같은 날짜 시장 팩터를 보므로 지수가 오른 날 종목 과반이 오른다.
// KIS 의 특이 케이스(.DJI 분봉 없음 · SPX/NDX 거래량 0 · 해외 지연 분)는 UI · README 가
// 그 근거로 쓰여 있어 그대로 흉내 낸다.

// 자릿수만 실제와 맞춘 앵커 레벨.
export const DEMO_INDEX_ANCHOR: Record<IndexCode, number> = {
  KOSPI: 2600,
  KOSDAQ: 780,
  KOSPI200: 350,
  KOSDAQ150: 1100,
  SPX: 5800,
  ".DJI": 42000,
  COMP: 18500,
  NDX: 20500,
  NI225: 39000,
  HSI: 20000,
  SHCOMP: 3300,
  DAX: 19500,
};

// ── 모델 상수 ─────────────────
const INDEX_BETA: Record<IndexCode, number> = {
  KOSPI: 1,
  KOSDAQ: 1.3,
  KOSPI200: 1,
  KOSDAQ150: 1.35,
  SPX: 1,
  ".DJI": 0.9,
  COMP: 1.15,
  NDX: 1.15,
  NI225: 1,
  HSI: 1,
  SHCOMP: 1,
  DAX: 1,
};
const INDEX_SIGMA: Record<IndexCode, number> = {
  KOSPI: 0.009,
  KOSDAQ: 0.013,
  KOSPI200: 0.009,
  KOSDAQ150: 0.013,
  SPX: 0.01,
  ".DJI": 0.01,
  COMP: 0.01,
  NDX: 0.01,
  NI225: 0.01,
  HSI: 0.01,
  SHCOMP: 0.01,
  DAX: 0.01,
};
// 상승·하락 종목수 근사의 모수(구성 종목 수)
const INDEX_CONSTITUENTS: Record<IndexCode, number> = {
  KOSPI: 930,
  KOSDAQ: 1700,
  KOSPI200: 200,
  KOSDAQ150: 150,
  SPX: 500,
  ".DJI": 30,
  COMP: 3000,
  NDX: 100,
  NI225: 225,
  HSI: 80,
  SHCOMP: 2000,
  DAX: 40,
};
const INDEX_VOLUME_SCALE: Record<IndexCode, number> = {
  KOSPI: 4e8,
  KOSDAQ: 9e8,
  KOSPI200: 1e8,
  KOSDAQ150: 1.5e8,
  SPX: 0,
  ".DJI": 3e8,
  COMP: 5e9,
  NDX: 0,
  NI225: 1.2e9,
  HSI: 2e9,
  SHCOMP: 3e10,
  DAX: 7e7,
};
const IDIO_SIGMA = 0.002;
const GAP_SIGMA_RATIO = 0.4;
const WICK_SIGMA_RATIO = 0.6;
const VOLUME_LOGNORMAL_SIGMA = 0.5;
const VOLUME_RETURN_BOOST = 2;
const MINUTE_WICK_RATIO = 0.5;
const U_PROFILE_DEPTH = 2;
const MINUTE_VOLUME_LOGNORMAL_SIGMA = 0.5;
const UNCHANGED_SHARE = 0.05;
const ADV_DECL_SLOPE = 4;
const KRX_OPEN_MIN = 9 * 60;
const KRX_CLOSE_MIN = 15 * 60 + 30; // 15:30 마감 봉 포함

const DAY_MS = 86_400_000;
const MINUTE_SEC = 60;

const round2 = (x: number): number => Math.round(x * 100) / 100;
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const toSign = (change: number): PriceSign => (change > 0 ? "up" : change < 0 ? "down" : "flat");

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

const isDomestic = (code: IndexCode): boolean => getIndexMeta(code).region === "domestic";
const marketOf = (code: IndexCode): DemoMarket =>
  isDomestic(code) ? "KRX" : OVERSEAS_INDEX_MARKET[code as OverseasIndexCode];

const isOverseasTradingDate = (code: OverseasIndexCode, date: string): boolean => {
  const dow = new Date(dateToMs(date)).getUTCDay();
  return dow !== 0 && dow !== 6 && !isOverseasIndexHoliday(code, date);
};

const listIndexTradingDates = (code: IndexCode, from: string, to: string): string[] => {
  if (isDomestic(code)) return listTradingDates(from, to);
  const out: string[] = [];
  for (let t = dateToMs(from); t <= dateToMs(to); t += DAY_MS) {
    const date = msToDate(t);
    if (isOverseasTradingDate(code as OverseasIndexCode, date)) out.push(date);
  }
  return out;
};

const previousIndexTradingDate = (code: IndexCode, date: string): string =>
  isDomestic(code)
    ? getPreviousKrxTradingDate(date)
    : getPreviousOverseasIndexTradingDate(code as OverseasIndexCode, date);

const snapToIndexTradingDate = (code: IndexCode, date: string): string =>
  listIndexTradingDates(code, date, date).length === 1 ? date : previousIndexTradingDate(code, date);

const nextIndexTradingDate = (code: IndexCode, date: string): string => {
  let t = dateToMs(date) + DAY_MS;
  while (listIndexTradingDates(code, msToDate(t), msToDate(t)).length === 0) t += DAY_MS;
  return msToDate(t);
};

// ── 일별 노이즈 · 종가 경로 ─────────────────
type DayNoise = { r: number; zGap: number; zHigh: number; zLow: number; zVolume: number };

const dayNoise = (code: IndexCode, date: string): DayNoise => {
  const rng = createRng(hashSeed("index", code, date));
  const r = INDEX_BETA[code] * marketReturnDaily(marketOf(code), date) + IDIO_SIGMA * gaussian(rng);
  return { r, zGap: gaussian(rng), zHigh: gaussian(rng), zLow: gaussian(rng), zVolume: gaussian(rng) };
};

// [from, to] 거래일 각각의 종가. 앵커에서 양방향 자유 워크.
const closePath = (code: IndexCode, from: string, to: string): Map<string, number> => {
  const out = new Map<string, number>();
  const anchorDate = snapToIndexTradingDate(code, DEMO_ANCHOR_DATE);
  const anchor = DEMO_INDEX_ANCHOR[code];
  if (anchorDate >= from && anchorDate <= to) out.set(anchorDate, anchor);
  if (from < anchorDate) {
    const dates = listIndexTradingDates(code, from, anchorDate).filter((d) => d < anchorDate);
    let next = anchor;
    let nextDate = dates.length > 0 ? nextIndexTradingDate(code, dates[dates.length - 1]) : "";
    for (let i = dates.length - 1; i >= 0; i--) {
      next = round2(next / Math.exp(dayNoise(code, nextDate).r));
      out.set(dates[i], next);
      nextDate = dates[i];
    }
  }
  if (to > anchorDate) {
    let prev = anchor;
    for (const date of listIndexTradingDates(code, anchorDate, to).slice(1)) {
      prev = round2(prev * Math.exp(dayNoise(code, date).r));
      if (date >= from) out.set(date, prev);
    }
  }
  return out;
};

// ── 일봉 ─────────────────
const buildDailyBar = (
  code: IndexCode,
  date: string,
  close: number,
  prevClose: number,
): IndexDailySnapshot => {
  const noise = dayNoise(code, date);
  const sigma = INDEX_SIGMA[code];
  const open = round2(prevClose * Math.exp(GAP_SIGMA_RATIO * sigma * noise.zGap));
  const high = round2(Math.max(open, close) * (1 + WICK_SIGMA_RATIO * sigma * Math.abs(noise.zHigh)));
  const low = round2(Math.min(open, close) * (1 - WICK_SIGMA_RATIO * sigma * Math.abs(noise.zLow)));
  const change = round2(close - prevClose);
  const scale = INDICES_WITHOUT_VOLUME.has(code) ? 0 : INDEX_VOLUME_SCALE[code];
  const volume = Math.round(
    scale *
      Math.exp(VOLUME_LOGNORMAL_SIGMA * noise.zVolume) *
      (1 + (VOLUME_RETURN_BOOST * Math.abs(noise.r)) / sigma),
  );
  return {
    indexCode: code,
    date,
    open,
    high,
    low,
    close,
    change,
    changeRate: round2((change / prevClose) * 100),
    volume,
  };
};

export const generateIndexDailyBars = (
  code: IndexCode,
  from: string,
  to: string,
): IndexDailySnapshot[] => {
  const dates = listIndexTradingDates(code, from, to);
  if (dates.length === 0) return [];
  const prev = previousIndexTradingDate(code, dates[0]);
  const path = closePath(code, prev, to);
  const c = (d: string): number => path.get(d) as number;
  let prevDate = prev;
  return dates.map((date) => {
    const bar = buildDailyBar(code, date, c(date), c(prevDate));
    prevDate = date;
    return bar;
  });
};

// ── 분봉 ─────────────────
// 벽시계(국내 KST · 해외 거래소 로컬)를 UTC 로 위장한 epoch 초, START 라벨.
const fakeUtcSec = (date: string, minuteOfDay: number): number =>
  dateToMs(date) / 1000 + minuteOfDay * MINUTE_SEC;

const hhmmToMinutes = (hhmm: string): number =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));

// 봉 라벨 창 [startMin, endMin] (포함). 국내는 15:30 마감 봉까지, 해외는 마감 직전 분까지.
const sessionWindow = (code: IndexCode): { startMin: number; endMin: number } => {
  if (isDomestic(code)) return { startMin: KRX_OPEN_MIN, endMin: KRX_CLOSE_MIN };
  const overseas = code as OverseasIndexCode;
  return {
    startMin: hhmmToMinutes(OVERSEAS_INDEX_OPEN_LOCAL[overseas]),
    endMin: hhmmToMinutes(OVERSEAS_INDEX_CLOSE_LOCAL[overseas]) - 1,
  };
};

const minuteBridge = (
  rng: () => number,
  start: number,
  end: number,
  n: number,
  sigmaMinute: number,
): number[] => {
  const logs: number[] = new Array(n);
  let acc = Math.log(start);
  for (let i = 0; i < n; i++) {
    acc += sigmaMinute * gaussian(rng);
    logs[i] = acc;
  }
  const correction = (Math.log(end) - logs[n - 1]) / n;
  return logs.map((l, i) => Math.exp(l + correction * (i + 1)));
};

const fitHighLow = (closes: number[], start: number, end: number, high: number, low: number): void => {
  const n = closes.length;
  const chord = (i: number): number => start + ((end - start) * (i + 1)) / n;
  let scaleUp = Infinity;
  let scaleDown = Infinity;
  for (let i = 0; i < n; i++) {
    const excess = closes[i] - chord(i);
    if (excess > 0) scaleUp = Math.min(scaleUp, (high - chord(i)) / excess);
    else if (excess < 0) scaleDown = Math.min(scaleDown, (chord(i) - low) / -excess);
  }
  for (let i = 0; i < n; i++) {
    const excess = closes[i] - chord(i);
    if (excess > 0 && Number.isFinite(scaleUp)) closes[i] = chord(i) + excess * scaleUp;
    else if (excess < 0 && Number.isFinite(scaleDown)) closes[i] = chord(i) + excess * scaleDown;
  }
  if (!Number.isFinite(scaleUp)) closes[Math.floor(n / 3)] = high;
  if (!Number.isFinite(scaleDown)) closes[Math.floor((2 * n) / 3)] = low;
};

const allocateVolume = (rng: () => number, n: number, total: number): number[] => {
  const weights: number[] = new Array(n);
  const half = Math.max(1, (n - 1) / 2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = (i - half) / half;
    weights[i] =
      (1 + U_PROFILE_DEPTH * x * x) * Math.exp(MINUTE_VOLUME_LOGNORMAL_SIGMA * gaussian(rng));
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

// .DJI 도 내부 경로는 만든다 — 분봉은 공개하지 않지만 quote 는 장중에 움직여야 한다.
const intradayPath = (
  code: IndexCode,
  date: string,
  prev: IndexDailySnapshot,
  today: IndexDailySnapshot,
): IndexIntradaySnapshot[] => {
  const { startMin, endMin } = sessionWindow(code);
  const n = endMin - startMin + 1;
  const rng = createRng(hashSeed("index", code, date, "intraday"));
  const sigmaMinute = INDEX_SIGMA[code] / Math.sqrt(n);
  const closes = minuteBridge(rng, today.open, today.close, n, sigmaMinute);
  fitHighLow(closes, today.open, today.close, today.high, today.low);
  const volumes = allocateVolume(rng, n, today.volume ?? 0);
  const clamp = (p: number): number => Math.min(today.high, Math.max(today.low, p));
  const bars: IndexIntradaySnapshot[] = new Array(n);
  let open = today.open;
  for (let i = 0; i < n; i++) {
    const close = clamp(round2(closes[i]));
    const wick = MINUTE_WICK_RATIO * sigmaMinute * rng();
    const change = round2(close - prev.close);
    bars[i] = {
      indexCode: code,
      timestamp: fakeUtcSec(date, startMin + i),
      open,
      high: clamp(round2(Math.max(open, close) * (1 + wick))),
      low: clamp(round2(Math.min(open, close) * (1 - wick))),
      close,
      change,
      changeRate: round2((change / prev.close) * 100),
      volume: volumes[i],
    };
    open = close;
  }
  return bars;
};

const dailyPair = (code: IndexCode, date: string): [IndexDailySnapshot, IndexDailySnapshot] => {
  const prevDate = previousIndexTradingDate(code, date);
  const [prev, today] = generateIndexDailyBars(code, prevDate, date);
  return [prev, today];
};

export const generateIndexIntradayBars = (
  code: IndexCode,
  date: string,
): IndexIntradaySnapshot[] | null => {
  if (code === ".DJI") return null;
  const d = snapToIndexTradingDate(code, date);
  const [prev, today] = dailyPair(code, d);
  return intradayPath(code, d, prev, today);
};

// ── 현재가 ─────────────────
const OVERSEAS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

const overseasLocalParts = (
  code: OverseasIndexCode,
  now: Date,
): { date: string; minutes: number } => {
  const tz = OVERSEAS_INDEX_TIMEZONE[code];
  let f = OVERSEAS_FORMATTER_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    OVERSEAS_FORMATTER_CACHE.set(tz, f);
  }
  const bag: Record<string, string> = {};
  for (const p of f.formatToParts(now)) if (p.type !== "literal") bag[p.type] = p.value;
  const hour = Number(bag.hour === "24" ? "00" : bag.hour); // en-US 24h 는 자정을 "24" 로 반환
  return { date: `${bag.year}-${bag.month}-${bag.day}`, minutes: hour * 60 + Number(bag.minute) };
};

export const indexQuoteAt = (code: IndexCode, name: string, now: Date): IndexQuote | null => {
  const domestic = isDomestic(code);
  const local = domestic
    ? getKstDateAndMinutes(now)
    : overseasLocalParts(code as OverseasIndexCode, now);
  const tradingDate = domestic
    ? getKrxTradingDate(now)
    : getOverseasIndexTradingDate(code as OverseasIndexCode, now);
  const { startMin, endMin } = sessionWindow(code);
  // 개장 전(거래일은 오늘로 넘어왔지만 봉이 없음)은 직전 거래일의 완결 상태를 보인다.
  let effectiveDate = tradingDate;
  let cutoffMin = Number.POSITIVE_INFINITY;
  if (local.date === tradingDate) {
    const delay = domestic ? 0 : (OVERSEAS_INDEX_DELAY_MIN[code as OverseasIndexCode] ?? 0);
    const m = local.minutes - delay;
    if (m < startMin) effectiveDate = previousIndexTradingDate(code, tradingDate);
    else cutoffMin = Math.min(m, endMin);
  }
  const [prev, today] = dailyPair(code, effectiveDate);
  const bars = intradayPath(code, effectiveDate, prev, today);
  const cutoffSec = fakeUtcSec(effectiveDate, cutoffMin);
  let price = prev.close;
  let open = 0;
  let high = 0;
  let low = 0;
  let volume = 0;
  let lastMinute = startMin;
  let seen = false;
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
    lastMinute = (bar.timestamp - fakeUtcSec(effectiveDate, 0)) / MINUTE_SEC;
  }
  const change = round2(price - prev.close);
  const ret = (price - prev.close) / prev.close;
  const n = INDEX_CONSTITUENTS[code];
  const advCount = Math.round(n * sigmoid((ADV_DECL_SLOPE * ret) / INDEX_SIGMA[code]));
  const declCount = Math.max(0, n - advCount - Math.round(n * UNCHANGED_SHARE));
  const time =
    domestic || code === ".DJI"
      ? null
      : {
          date: effectiveDate.replace(/-/g, ""),
          hour: `${pad2(Math.floor(lastMinute / 60))}${pad2(lastMinute % 60)}00`,
        };
  return {
    name,
    price,
    change,
    changeRate: round2((change / prev.close) * 100),
    sign: toSign(change),
    open,
    high,
    low,
    advCount,
    declCount,
    time,
    ...(domestic ? { volume } : {}),
  };
};
