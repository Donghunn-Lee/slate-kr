import { pool } from "./db";
import type { FinancialPeriod } from "@/shared/types/stock";

// dividends 테이블 원시 row. numeric 컬럼(dps/dart_yield/payout_ratio) 은
// db.ts 의 pool.query 가 Neon HTTP string → number 로 자동 변환하므로
// number | null 로 도착한다 (financials.ts 의 FinancialRow.eps/bps 대칭).
export type DividendRow = {
  ticker: string;
  year: number;
  stock_kind: "common" | "preferred";
  dps: number | null;
  dart_yield: number | null;
  payout_ratio: number | null;
};

export type DividendMetrics = {
  dps: number | null;
  payoutRatio: number | null;
  dividendYield: number | null;
};

// DART 원본은 % 단위 (예: 2.70, 29.20). 도메인 모델은 소수 규약
// (operatingMargin/roe 등과 동일 — formatPercent 가 100× 하여 표시)이므로
// dart_yield / payout_ratio 는 ÷100 하여 정규화한다.
const toDecimalPct = (v: number | null): number | null => (v === null ? null : v / 100);

export const rowsToDividendMap = (
  rows: readonly DividendRow[]
): Map<number, DividendMetrics> => {
  const map = new Map<number, DividendMetrics>();
  for (const row of rows) {
    map.set(row.year, {
      dps: row.dps,
      payoutRatio: toDecimalPct(row.payout_ratio),
      dividendYield: toDecimalPct(row.dart_yield),
    });
  }
  return map;
};

export const attachDividends = (
  periods: readonly FinancialPeriod[],
  byYear: ReadonlyMap<number, DividendMetrics>
): FinancialPeriod[] =>
  periods.map((p) => {
    if (p.reportType !== "annual") return { ...p };
    const d = byYear.get(p.year);
    if (!d) return { ...p };
    return {
      ...p,
      dps: d.dps,
      payoutRatio: d.payoutRatio,
      dividendYield: d.dividendYield,
    };
  });

// 배당 조회 실패는 재무 섹션 전체를 죽이지 않도록 catch 후 빈 Map 반환.
// (marketCalendar.ts 패턴 준용)
export const getDividendsByYear = async (
  ticker: string
): Promise<Map<number, DividendMetrics>> => {
  try {
    const [rows] = await pool.query<DividendRow[]>(
      "SELECT ticker, year, stock_kind, dps, dart_yield, payout_ratio FROM dividends WHERE ticker = $1 AND stock_kind = 'common'",
      [ticker]
    );
    return rowsToDividendMap(rows);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dividends] load failed for ${ticker}: ${message}`);
    return new Map();
  }
};
