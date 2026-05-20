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

type PriceRow = { yr: number; qtr: number; close: number };
type PriceMap = Map<string, number>; // key: `${year}-${quarter}`

const priceKey = (year: number, quarter: number) => `${year}-${quarter}`;

const fetchClosePricesByQuarter = async (ticker: string): Promise<PriceMap> => {
  const [rows] = await pool.query<PriceRow[]>(
    `SELECT DISTINCT ON (yr, qtr)
       EXTRACT(year FROM date)::int AS yr,
       CEIL(EXTRACT(month FROM date) / 3.0)::int AS qtr,
       close
     FROM daily_prices
     WHERE ticker = $1
     ORDER BY yr, qtr, date DESC`,
    [ticker]
  );
  const map: PriceMap = new Map();
  for (const row of rows) {
    map.set(priceKey(row.yr, row.qtr), row.close);
  }
  return map;
};

const safeDivide = (a: number | null, b: number | null): number | null => {
  if (a === null || b === null || b === 0) return null;
  return a / b;
};

const calcPer = (close: number | undefined, eps: number | null): number | null => {
  if (close === undefined || eps === null || eps <= 0) return null;
  return close / eps;
};

const calcPbr = (close: number | undefined, bps: number | null): number | null => {
  if (close === undefined || bps === null || bps <= 0) return null;
  return close / bps;
};

const calculateDerivedMetrics = (raw: {
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
}): {
  operatingMargin: number | null;
  netMargin: number | null;
  debtRatio: number | null;
  roe: number | null;
  roa: number | null;
} => {
  const operatingMargin = safeDivide(raw.operatingProfit, raw.revenue);
  const netMargin = safeDivide(raw.netIncome, raw.revenue);
  const debtRatio =
    raw.totalAssets !== null && raw.totalEquity !== null
      ? safeDivide(raw.totalAssets - raw.totalEquity, raw.totalEquity)
      : null;
  const roe = safeDivide(raw.netIncome, raw.totalEquity);
  const roa = safeDivide(raw.netIncome, raw.totalAssets);
  return { operatingMargin, netMargin, debtRatio, roe, roa };
};

const rowToFinancialPeriod = (row: FinancialRow, close?: number): FinancialPeriod => {
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
    quarter: row.quarter,
    reportType: row.report_type,
    revenue: row.revenue,
    operatingProfit: row.operating_profit,
    netIncome: row.net_income,
    totalAssets: row.total_assets,
    totalEquity: row.total_equity,
    eps: row.eps,
    bps: row.bps,
    per: calcPer(close, row.eps),
    pbr: calcPbr(close, row.bps),
    ...calculateDerivedMetrics(raw),
  };
};

const sumFlow = (
  rows: (FinancialRow | undefined)[],
  field: "revenue" | "operating_profit" | "net_income"
): number | null => {
  let total = 0;
  for (const row of rows) {
    const v = row?.[field] ?? null;
    if (v === null) return null;
    total += v;
  }
  return total;
};

const buildQuarterlyPeriods = (
  quarterRows: FinancialRow[],
  annualRow: FinancialRow | null,
  priceMap: PriceMap
): FinancialPeriod[] => {
  const byQuarter = new Map<number, FinancialRow>();
  for (const row of quarterRows) {
    if (row.quarter !== null) byQuarter.set(row.quarter, row);
  }

  const result: FinancialPeriod[] = [];

  for (const row of byQuarter.values()) {
    const close = priceMap.get(priceKey(row.year, row.quarter!));
    result.push(rowToFinancialPeriod(row, close));
  }

  if (annualRow) {
    const q1 = byQuarter.get(1);
    const q2 = byQuarter.get(2);
    const q3 = byQuarter.get(3);
    const qRows = [q1, q2, q3];

    const subFlow = (annual: number | null, sum: number | null): number | null => {
      if (annual === null || sum === null) return null;
      return annual - sum;
    };

    const q4Revenue = subFlow(annualRow.revenue, sumFlow(qRows, "revenue"));
    const q4OperatingProfit = subFlow(
      annualRow.operating_profit,
      sumFlow(qRows, "operating_profit")
    );
    const q4NetIncome = subFlow(annualRow.net_income, sumFlow(qRows, "net_income"));

    const raw = {
      revenue: q4Revenue,
      operatingProfit: q4OperatingProfit,
      netIncome: q4NetIncome,
      totalAssets: annualRow.total_assets,
      totalEquity: annualRow.total_equity,
    };

    // Q4 종가 = 해당 연도 마지막 거래일 종가 (= 연간 마지막 분기)
    const q4Close = priceMap.get(priceKey(annualRow.year, 4));

    result.push({
      ticker: annualRow.ticker,
      year: annualRow.year,
      quarter: 4,
      reportType: "quarter",
      revenue: q4Revenue,
      operatingProfit: q4OperatingProfit,
      netIncome: q4NetIncome,
      totalAssets: annualRow.total_assets,
      totalEquity: annualRow.total_equity,
      eps: annualRow.eps,
      bps: annualRow.bps,
      per: calcPer(q4Close, annualRow.eps),
      pbr: calcPbr(q4Close, annualRow.bps),
      ...calculateDerivedMetrics(raw),
    });
  }

  return result.sort((a, b) => (a.quarter ?? 0) - (b.quarter ?? 0));
};

export const getFinancials = async (ticker: string): Promise<StockFinancials> => {
  const [[rows], priceMap] = await Promise.all([
    pool.query<FinancialRow[]>(
      "SELECT * FROM financial_statements WHERE ticker = $1 ORDER BY year DESC, quarter DESC",
      [ticker]
    ),
    fetchClosePricesByQuarter(ticker),
  ]);

  const annualRows = rows.filter((r) => r.report_type === "annual").slice(0, 5);
  const quarterRows = rows.filter((r) => r.report_type === "quarter");

  // 연간: 해당 연도 마지막 거래일 종가 = Q4 마지막 거래일 종가
  const annual = annualRows.map((row) => {
    const close = priceMap.get(priceKey(row.year, 4));
    return rowToFinancialPeriod(row, close);
  });

  // 연도별 그룹핑 후 단분기 변환
  const yearSet = new Set(quarterRows.map((r) => r.year));
  const quarterly: FinancialPeriod[] = [];
  for (const year of yearSet) {
    const yearQuarters = quarterRows.filter((r) => r.year === year);
    const annualForYear = annualRows.find((r) => r.year === year) ?? null;
    quarterly.push(...buildQuarterlyPeriods(yearQuarters, annualForYear, priceMap));
  }
  quarterly.sort((a, b) => b.year - a.year || (b.quarter ?? 0) - (a.quarter ?? 0));

  return { annual, quarterly };
};

export const getLatestFinancial = async (ticker: string): Promise<FinancialPeriod | null> => {
  const [rows] = await pool.query<FinancialRow[]>(
    "SELECT * FROM financial_statements WHERE ticker = $1 AND report_type = 'annual' ORDER BY year DESC LIMIT 1",
    [ticker]
  );

  if (rows.length === 0) return null;
  return rowToFinancialPeriod(rows[0]);
};
