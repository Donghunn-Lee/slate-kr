import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import type { FinancialPeriod, StockFinancials } from "@/shared/types/stock";

type FinancialRow = {
  id: number;
  ticker: string;
  corp_code: string | null;
  year: number;
  quarter: number | null;
  report_type: "annual" | "quarter";
  revenue: number | null;
  operating_profit: number | null;
  net_income: number | null;
  total_assets: number | null;
  total_equity: number | null;
  eps: number | null;
  bps: number | null;
  created_at: Date;
};

const safeDivide = (a: number | null, b: number | null): number | null => {
  if (a === null || b === null || b === 0) return null;
  return a / b;
};

const calculateDerivedMetrics = (raw: {
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
}): { operatingMargin: number | null; debtRatio: number | null; roe: number | null } => {
  const operatingMargin = safeDivide(raw.operatingProfit, raw.revenue);
  const debtRatio =
    raw.totalAssets !== null && raw.totalEquity !== null
      ? safeDivide(raw.totalAssets - raw.totalEquity, raw.totalEquity)
      : null;
  const roe = safeDivide(raw.netIncome, raw.totalEquity);
  return { operatingMargin, debtRatio, roe };
};

const convertYtdToQuarterly = (
  quarterRows: FinancialRow[],
  annualRow: FinancialRow | undefined
): FinancialPeriod[] => {
  const byQuarter = new Map<number, FinancialRow>();
  for (const row of quarterRows) {
    if (row.quarter !== null) byQuarter.set(row.quarter, row);
  }

  const diffFields = (curr: number | null, prev: number | null): number | null => {
    if (curr === null || prev === null) return null;
    return curr - prev;
  };

  const makePeriod = (
    row: FinancialRow,
    q: number,
    revenue: number | null,
    operatingProfit: number | null,
    netIncome: number | null
  ): FinancialPeriod => {
    const raw = {
      revenue,
      operatingProfit,
      netIncome,
      totalAssets: row.total_assets,
      totalEquity: row.total_equity,
    };
    return {
      ticker: row.ticker,
      year: row.year,
      quarter: q,
      reportType: "quarter",
      revenue,
      operatingProfit,
      netIncome,
      totalAssets: row.total_assets,
      totalEquity: row.total_equity,
      eps: row.eps,
      bps: row.bps,
      ...calculateDerivedMetrics(raw),
    };
  };

  const result: FinancialPeriod[] = [];

  const q1 = byQuarter.get(1);
  const q2 = byQuarter.get(2);
  const q3 = byQuarter.get(3);

  if (q1) {
    result.push(makePeriod(q1, 1, q1.revenue, q1.operating_profit, q1.net_income));
  }
  if (q2) {
    result.push(
      makePeriod(
        q2,
        2,
        diffFields(q2.revenue, q1?.revenue ?? null),
        diffFields(q2.operating_profit, q1?.operating_profit ?? null),
        diffFields(q2.net_income, q1?.net_income ?? null)
      )
    );
  }
  if (q3) {
    result.push(
      makePeriod(
        q3,
        3,
        diffFields(q3.revenue, q2?.revenue ?? null),
        diffFields(q3.operating_profit, q2?.operating_profit ?? null),
        diffFields(q3.net_income, q2?.net_income ?? null)
      )
    );
  }
  if (annualRow && q3) {
    result.push(
      makePeriod(
        annualRow,
        4,
        diffFields(annualRow.revenue, q3.revenue),
        diffFields(annualRow.operating_profit, q3.operating_profit),
        diffFields(annualRow.net_income, q3.net_income)
      )
    );
  }

  return result.sort((a, b) => (b.quarter ?? 0) - (a.quarter ?? 0));
};

const rowToAnnual = (row: FinancialRow): FinancialPeriod => {
  const raw = {
    revenue: row.revenue,
    operatingProfit: row.operating_profit,
    netIncome: row.net_income,
    totalAssets: row.total_assets,
    totalEquity: row.total_equity,
  };
  return {
    ticker: row.ticker,
    year: row.year,
    quarter: null,
    reportType: "annual",
    revenue: row.revenue,
    operatingProfit: row.operating_profit,
    netIncome: row.net_income,
    totalAssets: row.total_assets,
    totalEquity: row.total_equity,
    eps: row.eps,
    bps: row.bps,
    ...calculateDerivedMetrics(raw),
  };
};

export const getFinancials = async (ticker: string): Promise<StockFinancials> => {
  const [rows] = await pool.query<(FinancialRow & RowDataPacket)[]>(
    "SELECT * FROM financial_statements WHERE ticker = ? ORDER BY year DESC, quarter DESC",
    [ticker]
  );

  const annualRows = rows.filter((r) => r.report_type === "annual").slice(0, 5);
  const quarterRows = rows.filter((r) => r.report_type === "quarter");

  const annual = annualRows.map(rowToAnnual);

  // 연도별 그룹핑 후 단분기 변환
  const yearSet = new Set(quarterRows.map((r) => r.year));
  const quarterly: FinancialPeriod[] = [];
  for (const year of yearSet) {
    const yearQuarters = quarterRows.filter((r) => r.year === year);
    const annualForYear = annualRows.find((r) => r.year === year);
    quarterly.push(...convertYtdToQuarterly(yearQuarters, annualForYear));
  }
  quarterly.sort((a, b) => b.year - a.year || (b.quarter ?? 0) - (a.quarter ?? 0));

  return { annual, quarterly };
};

export const getLatestFinancial = async (ticker: string): Promise<FinancialPeriod | null> => {
  const [rows] = await pool.query<(FinancialRow & RowDataPacket)[]>(
    'SELECT * FROM financial_statements WHERE ticker = ? AND report_type = "annual" ORDER BY year DESC LIMIT 1',
    [ticker]
  );

  if (rows.length === 0) return null;
  return rowToAnnual(rows[0]);
};
