import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { indexQuoteAt } from "./demo-index-model";
import { getTickerProfile } from "./demo-price-model";
import {
  fetchIndexQuote,
  fetchMultiQuote,
  fetchStockIntradayChart,
  fetchStockMarketAction,
  fetchStockQuote,
} from "./quote-source";

// universe 는 NXT 취급 1 · 비취급 1 두 종목 고정 — DB 없이 채널별 창을 본다.
vi.mock("./demo-universe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./demo-universe")>();
  const { getTickerProfile } = await import("./demo-price-model");
  const anchor = { eps: 5_000, bps: 40_000 };
  const pick = (nx: boolean): string => {
    for (let i = 1; i < 200; i++) {
      const ticker = String(100_000 + i);
      if (getTickerProfile(ticker, anchor).nxEligible === nx) return ticker;
    }
    throw new Error("unreachable");
  };
  const entries = [pick(true), pick(false)].map((ticker, i) => ({
    ticker,
    name: `종목${i}`,
    market: "KOSPI" as const,
    shares: 1_000_000,
    listedAt: "2000-01-01",
    profile: getTickerProfile(ticker, anchor),
  }));
  return {
    ...actual,
    getDemoUniverse: async () => entries,
    getDemoEntry: async (ticker: string) => entries.find((e) => e.ticker === ticker) ?? null,
  };
});

const ANCHOR = { eps: 5_000, bps: 40_000 };
const pick = (nx: boolean): string => {
  for (let i = 1; i < 200; i++) {
    const ticker = String(100_000 + i);
    if (getTickerProfile(ticker, ANCHOR).nxEligible === nx) return ticker;
  }
  throw new Error("unreachable");
};
const NXT = pick(true);
const KRX_ONLY = pick(false);

const kst = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) - 9, Number(hhmm.slice(2, 4))));
};
const minuteOf = (time: string | number): number => ((time as number) % 86_400) / 60;
const dateOf = (time: string | number): string =>
  new Date((time as number) * 1000).toISOString().slice(0, 10);
// 2026-11-10(화) 거래일, 전후 휴장 없음
const TODAY = "2026-11-10";
const PREV = "2026-11-09";

describe("fetchStockQuote", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: kst(TODAY, "1400") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("J · UN 같은 가격, NX 는 비취급 종목에서 null, 미등록은 null", async () => {
    const j = await fetchStockQuote(KRX_ONLY, "J");
    const un = await fetchStockQuote(KRX_ONLY, "UN");
    expect(j?.price).toBeGreaterThan(0);
    expect(j?.price).toBe(un?.price);
    expect(j?.ticker).toBe(KRX_ONLY);
    expect(await fetchStockQuote(KRX_ONLY, "NX")).toBeNull();
    expect((await fetchStockQuote(NXT, "NX"))?.price).toBe((await fetchStockQuote(NXT, "UN"))?.price);
    expect(await fetchStockQuote("000000", "J")).toBeNull();
  });

  it("시장조치는 없다", async () => {
    expect(await fetchStockMarketAction(KRX_ONLY)).toBeNull();
  });
});

describe("fetchMultiQuote", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: kst(TODAY, "1400") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("failed 는 미등록 ticker 만 true, 31개 입력 → 30개", async () => {
    const { quotes, failed } = await fetchMultiQuote([NXT, KRX_ONLY, "000000"]);
    expect(quotes[NXT]?.price).toBe((await fetchStockQuote(NXT, "UN"))?.price);
    expect(quotes["000000"]).toBeNull();
    expect(failed).toEqual({ [NXT]: false, [KRX_ONLY]: false, "000000": true });

    const many = Array.from({ length: 31 }, (_, i) => String(900_000 + i));
    const result = await fetchMultiQuote(many);
    expect(Object.keys(result.quotes)).toHaveLength(30);
    expect(Object.keys(result.quotes)).not.toContain(many[30]);
    expect(await fetchMultiQuote([])).toEqual({ quotes: {}, failed: {} });
  });
});

describe("fetchStockIntradayChart", () => {
  it("10:00 regular → 전일 tail 30 + 오늘 봉(10:00 까지), previousDay false", async () => {
    const result = await fetchStockIntradayChart(NXT, kst(TODAY, "1000"));
    expect(result?.previousDay).toBe(false);
    expect(result?.failed).toBe(false);
    expect(result?.tradingDate).toBe(TODAY);
    const bars = result?.bars ?? [];
    const tail = bars.filter((b) => dateOf(b.time) === PREV);
    const today = bars.filter((b) => dateOf(b.time) === TODAY);
    expect(tail).toHaveLength(30);
    expect(minuteOf(tail[tail.length - 1].time)).toBe(20 * 60);
    // NXT 취급 종목은 08:00 프리마켓부터
    expect(minuteOf(today[0].time)).toBe(8 * 60);
    expect(minuteOf(today[today.length - 1].time)).toBe(10 * 60);
    expect(bars.map((b) => b.time)).toEqual([...bars].map((b) => b.time).sort((a, b) => (a as number) - (b as number)));
  });

  it("07:00 → previousDay true + 전일 전체", async () => {
    const result = await fetchStockIntradayChart(NXT, kst(TODAY, "0700"));
    expect(result?.previousDay).toBe(true);
    expect(result?.tradingDate).toBe(PREV);
    const bars = result?.bars ?? [];
    expect(bars.every((b) => dateOf(b.time) === PREV)).toBe(true);
    expect(minuteOf(bars[0].time)).toBe(8 * 60);
    expect(minuteOf(bars[bars.length - 1].time)).toBe(20 * 60);
  });

  it("토요일 → previousDay true + 금요일 전체 (비NXT 는 09:00 시작)", async () => {
    const result = await fetchStockIntradayChart(KRX_ONLY, kst("2026-11-14", "1200"));
    expect(result?.previousDay).toBe(true);
    expect(result?.tradingDate).toBe("2026-11-13");
    const bars = result?.bars ?? [];
    expect(minuteOf(bars[0].time)).toBe(9 * 60);
    expect(minuteOf(bars[bars.length - 1].time)).toBe(20 * 60);
  });

  it("비NXT 08:30 → 오늘 봉 없음, 전일 tail 만", async () => {
    const result = await fetchStockIntradayChart(KRX_ONLY, kst(TODAY, "0830"));
    expect(result?.previousDay).toBe(false);
    expect(result?.tradingDate).toBe(TODAY);
    const bars = result?.bars ?? [];
    expect(bars).toHaveLength(30);
    expect(bars.every((b) => dateOf(b.time) === PREV)).toBe(true);
  });

  it("21:00 after_close → 오늘 전체, tail 없음 · 미등록 → null", async () => {
    const result = await fetchStockIntradayChart(NXT, kst(TODAY, "2100"));
    const bars = result?.bars ?? [];
    expect(result?.previousDay).toBe(false);
    expect(bars.every((b) => dateOf(b.time) === TODAY)).toBe(true);
    expect(minuteOf(bars[bars.length - 1].time)).toBe(20 * 60);
    expect(await fetchStockIntradayChart("000000", kst(TODAY, "2100"))).toBeNull();
  });
});

describe("fetchIndexQuote", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: kst(TODAY, "1030") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("'0001' → 코스피 현재가, 미지원 코드 → null", async () => {
    const quote = await fetchIndexQuote("0001");
    expect(quote).toEqual(indexQuoteAt("KOSPI", "코스피", kst(TODAY, "1030")));
    expect((await fetchIndexQuote("3003"))?.name).toBe("코스닥150");
    expect(await fetchIndexQuote("9999")).toBeNull();
  });
});
