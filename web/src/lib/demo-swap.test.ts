import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { isKrxHoliday } from "@/shared/utils/krxHolidays";
import { getDailyBar, quoteAt } from "./demo-price-model";
import { getDemoEntry } from "./demo-universe";
import { fetchClosePricesByQuarter, priceKey } from "./financials";
import { getIndexDailyPrices, getIndexIntradayPrices, getLatestIndexPrice } from "./indices";
import { getMarketCalendar } from "./market-calendar";
import {
  getDailyPrices,
  getLatestKstDate,
  getLatestPrice,
  getPriceSummariesByTickers,
} from "./prices";
import { fetchQuoteSnapshot } from "./quote-snapshots";
import {
  fetchIndexQuote,
  fetchMultiQuote,
  fetchStockIntradayChart,
  fetchStockQuote,
} from "./quote-source";
import { fetchRanking } from "./ranking-source";

// 생성기 경로 정합만 본다 — DB 는 universe 입력(종목 · 재무) 두 쿼리뿐이라 고정 행으로 대체.
vi.mock("./db", () => ({
  pool: {
    query: async (sql: string) =>
      sql.includes("FROM stocks")
        ? [[{ ticker: "005930", name: "삼성전자", market: "KOSPI", shares: 5_969_782_550, listed_at: "1975-06-11" }], null]
        : [[{ ticker: "005930", year: 2024, has_financial: true, eps: 4_950, bps: 57_930, net_income: 33_685_000_000_000, dps: 1_446, dart_yield: 2.7 }], null],
  },
}));

const T = "005930";
const SHARES = 5_969_782_550;
const kst = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) - 9, Number(hhmm.slice(2, 4))));
};
// 2026-11-10(화) 거래일, 전후 휴장 없음
const TODAY = "2026-11-10";

describe("생성기 교체 정합", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: kst(TODAY, "2100") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. 최신 일봉 close = 스냅샷 un_close = 21:00 quoteAt(UN).price", async () => {
    const entry = await getDemoEntry(T);
    const latest = await getLatestPrice(T);
    const { row, dateExists } = await fetchQuoteSnapshot(T, kst(TODAY, "2100"));
    expect(dateExists).toBe(true);
    expect(latest?.date).toBe(TODAY);
    expect(row?.un_close).toBe(latest?.close);
    expect(quoteAt(T, entry!.profile, kst(TODAY, "2100"), "UN")?.price).toBe(latest?.close);
    expect(row?.un_change).toBe((latest?.close ?? 0) - (latest?.basePrice ?? 0));
  });

  it("2. getDailyPrices 마지막 봉 = getLatestKstDate · 장중엔 오늘 봉 없음 · 20:30 엔 있음", async () => {
    vi.setSystemTime(kst(TODAY, "1400"));
    const midday = await getDailyPrices(T, 30);
    expect(midday).toHaveLength(30);
    expect(midday[0].date).toBe("2026-11-09");
    expect(midday[0].date).toBe(await getLatestKstDate(T));
    expect(midday[0].date > midday[1].date).toBe(true);
    expect((await fetchQuoteSnapshot(T, kst(TODAY, "1600"))).dateExists).toBe(false);

    vi.setSystemTime(kst(TODAY, "2030"));
    const evening = await getDailyPrices(T, 30);
    expect(evening[0].date).toBe(TODAY);
    expect(evening[0].date).toBe(await getLatestKstDate(T));
    expect(evening[0].marketCap).toBe(evening[0].close * SHARES);
  });

  it("3. getPriceSummariesByTickers.change = close − basePrice, 미등록 ticker 는 누락", async () => {
    const [summary] = await getPriceSummariesByTickers([T, "000000"]);
    const latest = await getLatestPrice(T);
    expect(summary.ticker).toBe(T);
    expect(summary.change).toBe((latest?.close ?? 0) - (latest?.basePrice ?? 0));
    expect(summary.date).toBe(TODAY);
    expect(await getPriceSummariesByTickers(["000000"])).toEqual([]);
  });

  it("4. 분기 종가 = 분기말 거래일 getDailyBar.close, 진행 중 분기는 최신 EOD", async () => {
    const entry = await getDemoEntry(T);
    const map = await fetchClosePricesByQuarter(T);
    const closeAt = (date: string): number => getDailyBar(T, entry!.profile, date).close;
    expect(map.get(priceKey(2024, 4))).toBe(closeAt("2024-12-31"));
    expect(map.get(priceKey(2025, 2))).toBe(closeAt("2025-06-30"));
    expect(map.get(priceKey(2025, 4))).toBe(closeAt("2025-12-31"));
    expect(map.get(priceKey(2026, 3))).toBe(closeAt("2026-09-30"));
    expect(map.get(priceKey(2026, 4))).toBe(closeAt(TODAY));
    expect(map.has(priceKey(2015, 4))).toBe(false);
  });

  it("5. getIndexDailyPrices(KOSPI, 10) 10건 ASC, 마지막 = getLatestIndexPrice", async () => {
    const bars = await getIndexDailyPrices("KOSPI", 10);
    expect(bars).toHaveLength(10);
    for (let i = 1; i < bars.length; i++) expect(bars[i].date > bars[i - 1].date).toBe(true);
    expect(bars[bars.length - 1].date).toBe(TODAY);
    expect(await getLatestIndexPrice("KOSPI")).toEqual(bars[bars.length - 1]);
    expect(await getIndexDailyPrices("NOPE", 10)).toEqual([]);
  });

  it("6. getMarketCalendar → {} · 2025-10-06 추석은 정적 표 휴장", async () => {
    expect(await getMarketCalendar()).toEqual({});
    expect(isKrxHoliday("2025-10-06")).toBe(true);
  });

  it("7. 14:00: 헤더 quote = 분봉 마지막 봉 = 멀티 시세 = 순위 안 가격", async () => {
    vi.setSystemTime(kst(TODAY, "1400"));
    const quote = await fetchStockQuote(T, "UN");
    const chart = await fetchStockIntradayChart(T);
    const bars = chart?.bars ?? [];
    expect(quote?.price).toBeGreaterThan(0);
    expect(bars[bars.length - 1].close).toBe(quote?.price);
    expect((await fetchMultiQuote([T])).quotes[T]?.price).toBe(quote?.price);
    const ranking = await fetchRanking({ kind: "volume", by: "volume", market: "all" }, "regular");
    expect(ranking.ok && ranking.items.find((i) => i.ticker === T)?.price).toBe(quote?.price);
  });

  it("8. 21:00: 헤더 quote = 스냅샷 un_close = 최신 일봉 close", async () => {
    const quote = await fetchStockQuote(T, "UN");
    const { row } = await fetchQuoteSnapshot(T, kst(TODAY, "2100"));
    expect(row?.un_close).toBe(quote?.price);
    expect((await getLatestPrice(T))?.close).toBe(quote?.price);
  });

  it("9. 코스피 quote = 장중 분봉 마지막 close, 마감 후엔 최신 일봉 close", async () => {
    vi.setSystemTime(kst(TODAY, "1400"));
    const midday = await fetchIndexQuote("0001");
    const bars = (await getIndexIntradayPrices("KOSPI")) ?? [];
    expect(bars[bars.length - 1].close).toBe(midday?.price);
    vi.setSystemTime(kst(TODAY, "2100"));
    const evening = await fetchIndexQuote("0001");
    expect((await getLatestIndexPrice("KOSPI"))?.close).toBe(evening?.price);
  });
});
