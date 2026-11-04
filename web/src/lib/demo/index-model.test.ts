import { describe, it, expect } from "vitest";
import { INDEX_CODES } from "@/shared/constants/indices";
import {
  DEMO_INDEX_ANCHOR,
  generateIndexDailyBars,
  generateIndexIntradayBars,
  indexQuoteAt,
} from "./index-model";
import { DEMO_ANCHOR_DATE, listTradingDates, marketReturnDaily } from "./price-model";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

const kst = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) - 9, Number(hhmm.slice(2, 4))));
};
const minuteOf = (bar: IndexIntradaySnapshot): number => (bar.timestamp % 86_400) / 60;
const TODAY = "2026-11-10";

describe("결정론 · 앵커", () => {
  it.each(INDEX_CODES)("%s: 같은 입력 2회 → 같은 일봉, 앵커 날 close = 앵커 레벨", (code) => {
    const a = generateIndexDailyBars(code, "2026-01-02", "2026-11-30");
    expect(a).toEqual(generateIndexDailyBars(code, "2026-01-02", "2026-11-30"));
    expect(a.find((b) => b.date === DEMO_ANCHOR_DATE)?.close).toBe(DEMO_INDEX_ANCHOR[code]);
    for (const b of a) {
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
    }
  });
});

describe("8. 지수", () => {
  it("KOSPI 일봉 수익률 부호와 marketReturnDaily('KRX') 일치율 > 80% (100일)", () => {
    const dates = listTradingDates("2026-06-01", "2026-12-31");
    const bars = generateIndexDailyBars("KOSPI", dates[0], dates[dates.length - 1]);
    expect(bars.length).toBeGreaterThanOrEqual(100);
    const sample = bars.slice(0, 100);
    const matched = sample.filter((b) => Math.sign(b.change) === Math.sign(marketReturnDaily("KRX", b.date)));
    expect(matched.length / sample.length).toBeGreaterThan(0.8);
  });

  it(".DJI: intraday null · quote.time null, 장중에도 값은 있다", () => {
    expect(generateIndexIntradayBars(".DJI", TODAY)).toBeNull();
    const q = indexQuoteAt(".DJI", "다우존스", new Date("2026-11-10T16:00:00Z")); // ET 11:00 장중
    expect(q?.time).toBeNull();
    expect(q?.price).toBeGreaterThan(0);
  });

  it("SPX · NDX volume 0, quote 에 volume 없음", () => {
    for (const code of ["SPX", "NDX"] as const) {
      const daily = generateIndexDailyBars(code, "2026-10-01", "2026-11-30");
      expect(daily.every((b) => b.volume === 0)).toBe(true);
      const intraday = generateIndexIntradayBars(code, TODAY) as IndexIntradaySnapshot[];
      expect(intraday.every((b) => b.volume === 0)).toBe(true);
      const q = indexQuoteAt(code, code, new Date("2026-11-10T16:00:00Z"));
      expect(q?.volume).toBeUndefined();
    }
  });

  it("국내 분봉 09:00~15:30 · 집계 = 일봉 · 전일 종가 대비 change", () => {
    const [prev, today] = generateIndexDailyBars("KOSPI", "2026-11-09", TODAY);
    const bars = generateIndexIntradayBars("KOSPI", TODAY) as IndexIntradaySnapshot[];
    expect(bars).toHaveLength(391);
    expect(minuteOf(bars[0])).toBe(9 * 60);
    expect(minuteOf(bars[bars.length - 1])).toBe(15 * 60 + 30);
    expect(bars[0].open).toBe(today.open);
    expect(bars[bars.length - 1].close).toBe(today.close);
    expect(Math.max(...bars.map((b) => b.high))).toBe(today.high);
    expect(Math.min(...bars.map((b) => b.low))).toBe(today.low);
    expect(bars.reduce((s, b) => s + b.volume, 0)).toBe(today.volume);
    expect(bars[bars.length - 1].change).toBe(today.change);
    expect(bars[10].change).toBeCloseTo(bars[10].close - prev.close, 2);
  });

  it("국내 quote: 장중은 분봉 지금까지, 개장 전은 전일 완결, 마감 후는 당일 일봉", () => {
    const [prev, today] = generateIndexDailyBars("KOSPI", "2026-11-09", TODAY);
    const bars = generateIndexIntradayBars("KOSPI", TODAY) as IndexIntradaySnapshot[];
    const live = indexQuoteAt("KOSPI", "코스피", kst(TODAY, "1030"));
    const upTo = bars.filter((b) => minuteOf(b) <= 10 * 60 + 30);
    expect(live?.price).toBe(upTo[upTo.length - 1].close);
    expect(live?.volume).toBe(upTo.reduce((s, b) => s + b.volume, 0));
    expect(live?.time).toBeNull();
    expect((live?.advCount ?? 0) + (live?.declCount ?? 0)).toBeLessThanOrEqual(930);
    const pre = indexQuoteAt("KOSPI", "코스피", kst(TODAY, "0830"));
    expect(pre?.price).toBe(prev.close);
    expect(pre?.change).toBe(prev.change);
    const closed = indexQuoteAt("KOSPI", "코스피", kst(TODAY, "1800"));
    expect(closed?.price).toBe(today.close);
    expect(closed?.change).toBe(today.change);
    expect(closed?.volume).toBe(today.volume);
  });

  it("해외 quote: 로컬 세션 창 · 지연 분 · time 은 로컬 라벨", () => {
    const bars = generateIndexIntradayBars("NI225", TODAY) as IndexIntradaySnapshot[];
    expect(minuteOf(bars[0])).toBe(9 * 60);
    expect(minuteOf(bars[bars.length - 1])).toBe(15 * 60 + 29);
    // JST 11:00 = 15분 지연이면 10:45 봉까지
    const q = indexQuoteAt("NI225", "니케이225", new Date("2026-11-10T02:00:00Z"));
    const upTo = bars.filter((b) => minuteOf(b) <= 10 * 60 + 45);
    expect(q?.price).toBe(upTo[upTo.length - 1].close);
    expect(q?.time).toEqual({ date: "20261110", hour: "104500" });
    const spx = indexQuoteAt("SPX", "S&P 500", new Date("2026-11-10T16:00:00Z")); // ET 11:00, 지연 0
    const spxBars = generateIndexIntradayBars("SPX", TODAY) as IndexIntradaySnapshot[];
    const spxUpTo = spxBars.filter((b) => minuteOf(b) <= 11 * 60);
    expect(spx?.price).toBe(spxUpTo[spxUpTo.length - 1].close);
    expect(spx?.time).toEqual({ date: "20261110", hour: "110000" });
  });
});
