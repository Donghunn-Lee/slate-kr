import { afterEach, describe, it, expect, vi } from "vitest";
import { generateIndexDailyBars, generateIndexIntradayBars } from "@/lib/demo/index-model";
import {
  getIndexIntradayPrices,
  getOverseasIndexIntradayPrices,
  toIntradaySnapshots,
} from "./indices";
import type { ChartBar, IndexIntradaySnapshot } from "@/shared/types/quote";

const kst = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) - 9, Number(hhmm.slice(2, 4))));
};
const minuteOf = (bar: IndexIntradaySnapshot): number => (bar.timestamp % 86_400) / 60;
const dateOf = (bar: IndexIntradaySnapshot): string =>
  new Date(bar.timestamp * 1000).toISOString().slice(0, 10);
// 2026-11-10(화) — 국내 · US 거래일, 전후 휴장 없음
const TODAY = "2026-11-10";
const PREV = "2026-11-09";

describe("getIndexIntradayPrices (국내)", () => {
  it("10:30 장중 → 전일 전체 + 오늘 10:30 까지, change 축 = 전일 일봉 close", async () => {
    const bars = (await getIndexIntradayPrices("KOSPI", kst(TODAY, "1030"))) ?? [];
    const prev = bars.filter((b) => dateOf(b) === PREV);
    const today = bars.filter((b) => dateOf(b) === TODAY);
    expect(prev).toHaveLength(391);
    expect(minuteOf(today[0])).toBe(9 * 60);
    expect(minuteOf(today[today.length - 1])).toBe(10 * 60 + 30);
    const [prevDaily] = generateIndexDailyBars("KOSPI", PREV, PREV);
    expect(today[0].change).toBeCloseTo(today[0].close - prevDaily.close, 2);
    expect(today[5].changeRate).toBeCloseTo(((today[5].close - prevDaily.close) / prevDaily.close) * 100, 2);
    expect(today.every((b) => b.volume > 0)).toBe(true);
  });

  it("토요일 → 금요일 전체만 (391봉), 18:00 마감 후 → 오늘 전체", async () => {
    const closed = (await getIndexIntradayPrices("KOSDAQ", kst("2026-11-14", "1200"))) ?? [];
    expect(closed).toHaveLength(391);
    expect(closed.every((b) => dateOf(b) === "2026-11-13")).toBe(true);
    const evening = (await getIndexIntradayPrices("KOSDAQ", kst(TODAY, "1800"))) ?? [];
    const today = evening.filter((b) => dateOf(b) === TODAY);
    expect(today).toHaveLength(391);
    expect(today).toEqual(generateIndexIntradayBars("KOSDAQ", TODAY));
  });
});

describe("getOverseasIndexIntradayPrices (해외)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("SPX ET 11:00 → 오늘 11:00 까지, change 축 = 전일 일봉 close, volume 0", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-10T16:00:00Z") });
    const bars = (await getOverseasIndexIntradayPrices("SPX", TODAY)) ?? [];
    const today = bars.filter((b) => dateOf(b) === TODAY);
    expect(minuteOf(today[today.length - 1])).toBe(11 * 60);
    const [prevDaily] = generateIndexDailyBars("SPX", PREV, PREV);
    expect(today[0].change).toBeCloseTo(today[0].close - prevDaily.close, 2);
    expect(bars.every((b) => b.volume === 0)).toBe(true);
    expect(bars.every((b) => b.indexCode === "SPX")).toBe(true);
  });
});

describe("toIntradaySnapshots", () => {
  const barSec = (hh: number, mm: number): number =>
    Date.UTC(2026, 7, 28, hh, mm) / 1000;

  it("해외 기본 → volume 0 강제 · 국내 useBarVolume=true → bar.volume 전달", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 30), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.88, volume: 7547 },
    ];
    const overseasOut = toIntradaySnapshots("SPX", bars, 6800);
    expect(overseasOut[0].volume).toBe(0);
    expect(overseasOut[0].change).toBeCloseTo(-11.12, 2);
    const domesticOut = toIntradaySnapshots("KOSPI", bars, 6800, true);
    expect(domesticOut[0].volume).toBe(7547);
    const noVol: ChartBar[] = [
      { time: barSec(15, 31), open: 1, high: 1, low: 1, close: 1 },
    ];
    expect(toIntradaySnapshots("KOSPI", noVol, 0, true)[0].volume).toBe(0);
    expect(toIntradaySnapshots("KOSPI", noVol, 0, true)[0].change).toBe(0);
  });
});
