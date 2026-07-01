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

const avgOf = (curr: number | null, prev: number | null): number | null => {
  if (curr === null) return null;
  if (prev === null) return curr; // 전기 데이터 없으면 기말 단순 폴백
  return (curr + prev) / 2;
};

const calculateDerivedMetrics = (
  raw: {
    revenue: number | null;
    operatingProfit: number | null;
    netIncome: number | null;
    totalAssets: number | null;
    totalEquity: number | null;
  },
  prevTotals?: { totalEquity: number | null; totalAssets: number | null }
): {
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
  const denomEquity = avgOf(raw.totalEquity, prevTotals?.totalEquity ?? null);
  const denomAssets = avgOf(raw.totalAssets, prevTotals?.totalAssets ?? null);
  const roe = safeDivide(raw.netIncome, denomEquity);
  const roa = safeDivide(raw.netIncome, denomAssets);
  return { operatingMargin, netMargin, debtRatio, roe, roa };
};

const rowToFinancialPeriod = (
  row: FinancialRow,
  close?: number,
  prevRow?: FinancialRow | null
): FinancialPeriod => {
  const raw = {
    revenue: row.revenue,
    operatingProfit: row.operating_profit,
    netIncome: row.net_income,
    totalAssets: row.total_assets,
    totalEquity: row.total_equity,
  };
  const prevTotals = prevRow
    ? { totalEquity: prevRow.total_equity, totalAssets: prevRow.total_assets }
    : undefined;
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
    ...calculateDerivedMetrics(raw, prevTotals),
  };
};

const sumFlow = (values: (number | null)[]): number | null => {
  let total = 0;
  for (const v of values) {
    if (v === null) return null;
    total += v;
  }
  return total;
};

const subFlow = (annual: number | null, sum: number | null): number | null => {
  if (annual === null || sum === null) return null;
  return annual - sum;
};

const buildQuarterlyPeriods = (
  quarterRows: FinancialRow[],
  annualRow: FinancialRow | null,
  priceMap: PriceMap,
  prevAnnualRow: FinancialRow | null
): FinancialPeriod[] => {
  const byQuarter = new Map<number, FinancialRow>();
  for (const row of quarterRows) {
    if (row.quarter !== null) byQuarter.set(row.quarter, row);
  }

  // 분기별 전기 행: Q1→전년 annual, Q2→Q1, Q3→Q2
  const prevByQuarter = new Map<number, FinancialRow | null>([
    [1, prevAnnualRow],
    [2, byQuarter.get(1) ?? null],
    [3, byQuarter.get(2) ?? null],
  ]);

  const result: FinancialPeriod[] = [];

  for (const row of byQuarter.values()) {
    const close = priceMap.get(priceKey(row.year, row.quarter!));
    const prevRow = prevByQuarter.get(row.quarter!) ?? null;
    result.push(rowToFinancialPeriod(row, close, prevRow));
  }

  if (annualRow) {
    const q1 = byQuarter.get(1);
    const q2 = byQuarter.get(2);
    const q3 = byQuarter.get(3);
    const pick = (field: "revenue" | "operating_profit" | "net_income" | "eps") => [
      q1?.[field] ?? null,
      q2?.[field] ?? null,
      q3?.[field] ?? null,
    ];

    const q4Revenue = subFlow(annualRow.revenue, sumFlow(pick("revenue")));
    const q4OperatingProfit = subFlow(
      annualRow.operating_profit,
      sumFlow(pick("operating_profit"))
    );
    const q4NetIncome = subFlow(annualRow.net_income, sumFlow(pick("net_income")));
    const q4Eps = subFlow(annualRow.eps, sumFlow(pick("eps")));

    // Q4 전기 = Q3 (기말 자산/자본)
    const q3PrevTotals = q3
      ? { totalEquity: q3.total_equity, totalAssets: q3.total_assets }
      : undefined;

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
      eps: q4Eps,
      bps: annualRow.bps,
      per: calcPer(q4Close, q4Eps),
      pbr: calcPbr(q4Close, annualRow.bps),
      ...calculateDerivedMetrics(raw, q3PrevTotals),
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
  // annualRows는 year DESC 정렬이므로 [i+1]이 전년도
  const annual = annualRows.map((row, i) => {
    const close = priceMap.get(priceKey(row.year, 4));
    const prevRow = annualRows[i + 1] ?? null;
    return rowToFinancialPeriod(row, close, prevRow);
  });

  // 연도별 그룹핑 후 단분기 변환
  const yearSet = new Set(quarterRows.map((r) => r.year));
  const quarterly: FinancialPeriod[] = [];
  for (const year of yearSet) {
    const yearQuarters = quarterRows.filter((r) => r.year === year);
    const annualForYear = annualRows.find((r) => r.year === year) ?? null;
    const prevAnnualForYear = annualRows.find((r) => r.year === year - 1) ?? null;
    quarterly.push(
      ...buildQuarterlyPeriods(yearQuarters, annualForYear, priceMap, prevAnnualForYear)
    );
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

export type TtmEpsSource =
  | "ttm"
  | "ttm_negative"
  | "annualized"
  | "annual_fallback"
  | "none";

export type TtmEps = {
  value: number | null;
  source: TtmEpsSource;
};

// 상장일 기준 4분기 도래 여부 판정 임계 (12개월 + 공시 시차 여유)
const RECENTLY_LISTED_MAX_MONTHS = 14;
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

// 최근순 quarterly 배열에서 최상단 몇 개가 (year, quarter) 기준
// 연속·EPS non-null 인지 세어 반환한다.
const countTopConsecutive = (quarterly: FinancialPeriod[]): number => {
  let count = 0;
  let prevYear: number | null = null;
  let prevQuarter: number | null = null;
  for (const q of quarterly) {
    if (q.eps === null || q.quarter === null) break;
    if (prevYear !== null && prevQuarter !== null) {
      const expectedNextYear = q.quarter === 4 ? q.year + 1 : q.year;
      const expectedNextQuarter = q.quarter === 4 ? 1 : q.quarter + 1;
      if (prevYear !== expectedNextYear || prevQuarter !== expectedNextQuarter) break;
    }
    count += 1;
    prevYear = q.year;
    prevQuarter = q.quarter;
    if (count === 4) break;
  }
  return count;
};

export const computeTtmEps = (
  quarterly: FinancialPeriod[],
  latestAnnual: FinancialPeriod | null,
  listedAt: Date | null = null
): TtmEps => {
  const annualEps = latestAnnual?.eps ?? null;
  const annualFallback: TtmEps =
    annualEps === null
      ? { value: null, source: "none" }
      : { value: annualEps, source: "annual_fallback" };

  const consecutive = countTopConsecutive(quarterly);

  // #1 / #2: 최근 4분기 완결
  if (consecutive === 4) {
    const sum = sumFlow(quarterly.slice(0, 4).map((q) => q.eps));
    if (sum === null) return annualFallback;
    return sum > 0
      ? { value: sum, source: "ttm" }
      : { value: null, source: "ttm_negative" };
  }

  // #3: 상장 1년 미만 & 최근부터 2~3분기 연속 → 연환산
  if (consecutive === 2 || consecutive === 3) {
    const monthsSinceListing =
      listedAt !== null ? (Date.now() - listedAt.getTime()) / MS_PER_MONTH : null;
    const notYetFourQuarters =
      monthsSinceListing !== null && monthsSinceListing < RECENTLY_LISTED_MAX_MONTHS;
    if (notYetFourQuarters) {
      const sum = sumFlow(quarterly.slice(0, consecutive).map((q) => q.eps));
      if (sum === null) return annualFallback;
      const annualized = sum * (4 / consecutive);
      return annualized > 0
        ? { value: annualized, source: "annualized" }
        : { value: null, source: "annualized" };
    }
  }

  // #4 / #5
  return annualFallback;
};
