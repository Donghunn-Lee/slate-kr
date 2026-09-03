import { describe, it, expect } from "vitest";
import { attachDividends, rowsToDividendMap } from "./dividends";
import type { DividendRow, DividendMetrics } from "./dividends";
import type { FinancialPeriod } from "@/shared/types/stock";

const mkRow = (o: Partial<DividendRow> & { year: number }): DividendRow => ({
  ticker: "005930",
  stock_kind: "common",
  dps: null,
  dart_yield: null,
  payout_ratio: null,
  ...o,
});

const mkFP = (o: Partial<FinancialPeriod>): FinancialPeriod => ({
  ticker: "005930",
  year: 2025,
  quarter: null,
  reportType: "annual",
  revenue: null,
  operatingProfit: null,
  netIncome: null,
  totalAssets: null,
  totalEquity: null,
  eps: null,
  bps: null,
  per: null,
  pbr: null,
  operatingMargin: null,
  netMargin: null,
  debtRatio: null,
  roe: null,
  roa: null,
  dps: null,
  payoutRatio: null,
  dividendYield: null,
  revenueGrowth: null,
  operatingProfitGrowth: null,
  netIncomeGrowth: null,
  ...o,
});

describe("rowsToDividendMap", () => {
  it("정상 2행 → year 키 Map, DART 원본 % → 소수 정규화·컬럼명 매핑", () => {
    const rows: DividendRow[] = [
      mkRow({ year: 2024, dps: 1446, dart_yield: 2.7, payout_ratio: 29.2 }),
      mkRow({ year: 2023, dps: 1444, dart_yield: 2.0, payout_ratio: 25.0 }),
    ];
    const map = rowsToDividendMap(rows);
    expect(map.size).toBe(2);
    const m2024 = map.get(2024)!;
    expect(m2024.dps).toBe(1446);
    expect(m2024.payoutRatio).toBeCloseTo(0.292, 6);
    expect(m2024.dividendYield).toBeCloseTo(0.027, 6);
    const m2023 = map.get(2023)!;
    expect(m2023.dps).toBe(1444);
    expect(m2023.payoutRatio).toBeCloseTo(0.25, 6);
    expect(m2023.dividendYield).toBeCloseTo(0.02, 6);
  });

  it("값 null 행 (미배당) → Map 에 null 그대로 보존 (조회는 됐음 표시)", () => {
    const rows: DividendRow[] = [mkRow({ year: 2024 })];
    const map = rowsToDividendMap(rows);
    expect(map.get(2024)).toEqual<DividendMetrics>({
      dps: null,
      payoutRatio: null,
      dividendYield: null,
    });
  });

  it("빈 배열 → 빈 Map", () => {
    expect(rowsToDividendMap([]).size).toBe(0);
  });
});

describe("attachDividends", () => {
  it("annual 만 병합, quarterly 는 원본 유지 (dps/payoutRatio/dividendYield 는 null 그대로)", () => {
    const periods: FinancialPeriod[] = [
      mkFP({ year: 2024, reportType: "annual" }),
      mkFP({ year: 2024, quarter: 3, reportType: "quarter" }),
    ];
    const byYear = new Map<number, DividendMetrics>([
      [2024, { dps: 1446, payoutRatio: 0.292, dividendYield: 0.027 }],
    ]);
    const out = attachDividends(periods, byYear);
    expect(out[0].dps).toBe(1446);
    expect(out[0].payoutRatio).toBe(0.292);
    expect(out[0].dividendYield).toBe(0.027);
    expect(out[1].dps).toBeNull();
    expect(out[1].payoutRatio).toBeNull();
    expect(out[1].dividendYield).toBeNull();
  });

  it("매칭 연도 없는 annual → 3필드 null 유지", () => {
    const periods: FinancialPeriod[] = [
      mkFP({ year: 2020, reportType: "annual" }),
    ];
    const byYear = new Map<number, DividendMetrics>([
      [2024, { dps: 1446, payoutRatio: 0.292, dividendYield: 0.027 }],
    ]);
    const out = attachDividends(periods, byYear);
    expect(out[0].dps).toBeNull();
    expect(out[0].payoutRatio).toBeNull();
    expect(out[0].dividendYield).toBeNull();
  });

  it("원본 배열·원본 요소 mutate 금지 (새 배열·새 객체 반환)", () => {
    const original = mkFP({ year: 2024, reportType: "annual" });
    const periods: FinancialPeriod[] = [original];
    const byYear = new Map<number, DividendMetrics>([
      [2024, { dps: 1446, payoutRatio: 0.292, dividendYield: 0.027 }],
    ]);
    const out = attachDividends(periods, byYear);
    expect(out).not.toBe(periods);
    expect(out[0]).not.toBe(original);
    expect(original.dps).toBeNull();
    expect(original.payoutRatio).toBeNull();
    expect(original.dividendYield).toBeNull();
  });
});
