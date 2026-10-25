import type { LineData, Time, UTCTimestamp, WhitespaceData } from "lightweight-charts";
import type { ChartPalette } from "@/shared/constants/chart";
import type { ChartBar } from "@/shared/types/quote";
import { makeLeadingWhitespace } from "@/entities/chart/leadingWhitespace";

const toTime = (t: string | number): Time =>
  typeof t === "number" ? (t as UTCTimestamp) : (t as `${number}-${number}-${number}`);

// dimBefore 지정 시 time<dimBefore 봉에 per-bar 흐린 색 주입. 나머지는 시리즈 기본색.
export const mapBar = (b: ChartBar, palette: ChartPalette, dimBefore: number | undefined) => {
  const base = {
    time: toTime(b.time),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  };
  if (dimBefore === undefined || typeof b.time !== "number" || b.time >= dimBefore) {
    return base;
  }
  const dimColor = b.close >= b.open ? palette.dim.up : palette.dim.down;
  return {
    ...base,
    color: dimColor,
    wickColor: dimColor,
    borderColor: dimColor,
  };
};

// close 기반 line 포인트. seriesKind === "line" 전용. dim/색 오버라이드는 사용하지 않음.
export const mapLine = (b: ChartBar): LineData => ({
  time: toTime(b.time),
  value: b.close,
});

// volume 히스토그램 포인트. volume 없는 봉은 null → 필터.
export type VolumePoint = { time: Time; value: number; color: string };
export const mapVolume = (b: ChartBar, palette: ChartPalette): VolumePoint | null => {
  if (b.volume === undefined) return null;
  return {
    time: toTime(b.time),
    value: b.volume,
    color: b.close >= b.open ? palette.volume.up : palette.volume.down,
  };
};

// "YYYY-MM-DD" ↔ epoch 일수 변환. 문자열 시간 봉의 whitespace 계산은 순수함수(숫자 기반)에
// 위임하기 위한 어댑터. Date.UTC 로 자정 anchor → 나눗셈으로 정수 일수 획득.
const dateToDayNum = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
};

const dayNumToDate = (n: number): string => {
  const dt = new Date(n * 86_400_000);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
};

// 첫 실봉 앞 whitespace 포인트 생성 — 시리즈 시간 형식에 맞춰 UTCTimestamp(숫자) 또는
// "YYYY-MM-DD"(문자열) 로 반환. count<=0 또는 bars.length<2 → [] (makeLeadingWhitespace 대칭).
// 문자열 케이스는 day-count 정수로 변환해 순수함수에 위임한 뒤 재포맷.
export const generateWhitespace = (bars: ChartBar[], count: number): WhitespaceData<Time>[] => {
  if (count <= 0 || bars.length < 2) return [];
  const first = bars[0].time;
  if (typeof first === "number") {
    const numeric = bars
      .filter((b): b is ChartBar & { time: number } => typeof b.time === "number")
      .map((b) => ({ time: b.time }));
    return makeLeadingWhitespace(numeric, count).map((w) => ({
      time: w.time as UTCTimestamp,
    }));
  }
  if (typeof first === "string") {
    const numeric = bars
      .filter((b): b is ChartBar & { time: string } => typeof b.time === "string")
      .map((b) => ({ time: dateToDayNum(b.time) }));
    return makeLeadingWhitespace(numeric, count).map((w) => ({
      time: dayNumToDate(w.time) as Time,
    }));
  }
  return [];
};

// close 기반 SMA. index i 에서 [i-p+1, i] 평균. i < p-1 자리는 점 없음.
// bars.length < period 면 빈 배열 반환 (호출 측에서 series 자체 생성 스킵).
type LinePoint = { time: Time; value: number };
export const computeSma = (bars: ChartBar[], period: number): LinePoint[] => {
  if (bars.length < period) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) {
      out.push({ time: toTime(bars[i].time), value: sum / period });
    }
  }
  return out;
};

// 마지막 봉만 갱신된 경우, 마지막 SMA 포인트 1개만 재계산 → series.update() 대상.
// bars.length < period 면 null (아직 유효한 SMA 점이 없음).
export const computeSmaLast = (bars: ChartBar[], period: number): LinePoint | null => {
  if (bars.length < period) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) sum += bars[i].close;
  return { time: toTime(bars[bars.length - 1].time), value: sum / period };
};
