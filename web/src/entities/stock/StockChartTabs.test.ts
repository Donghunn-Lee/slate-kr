import { describe, it, expect } from "vitest";
import type { StockPriceSnapshot } from "@/shared/types/stock";
import { stockPricesToBars } from "./StockChartTabs";

const snap = (
  date: string,
  close: number,
  basePrice: number | null,
): StockPriceSnapshot => ({
  ticker: "306620",
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1_000,
  marketCap: null,
  basePrice,
});

describe("stockPricesToBars — basePrice 전달", () => {
  it("DESC 입력을 ASC 로 뒤집고, base_price NULL 행은 basePrice 키를 생략한다", () => {
    const bars = stockPricesToBars([
      snap("2026-09-16", 1_388, 1_375), // 20:00 캔들 · 기준가 있음
      snap("2026-09-11", 1_300, null), // 9/13 이전 · NULL → 직전 close 폴백 대상
    ]);
    expect(bars.map((b) => b.time)).toEqual(["2026-09-11", "2026-09-16"]);
    expect(bars[0]).not.toHaveProperty("basePrice");
    expect(bars[1]).toMatchObject({ close: 1_388, basePrice: 1_375, volume: 1_000 });
  });
});
