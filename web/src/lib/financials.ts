import { cache } from "react";
import { pool } from "./db";
import { attachDividends, getDividendsByYear, type DividendMetrics } from "./dividends";
import { getShares } from "./stocks";
import { getBonusIssueExDate } from "@/shared/constants/bonusIssueExDates";
import type { FinancialPeriod, StockFinancials, TtmEpsSource } from "@/shared/types/stock";

// export 는 테스트 fixture 용 (UI 에서 import 하지 말 것).
export type FinancialRow = {
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
type PriceMap = ReadonlyMap<string, number>; // key: priceKey(year, quarter)

// export 는 테스트용 (fixture priceMap 키 생성).
export const priceKey = (year: number, quarter: number) => `${year}-${quarter}`;

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
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(priceKey(row.yr, row.qtr), row.close);
  }
  return map;
};

const safeDivide = (a: number | null, b: number | null): number | null => {
  if (a === null || b === null || b === 0) return null;
  return a / b;
};

// PER = 주가 ÷ EPS. EPS ≤ 0 이면 null (적자 PER 은 표기하지 않는다).
export const calcPer = (close: number | null, eps: number | null): number | null => {
  if (close === null || eps === null || eps <= 0) return null;
  return close / eps;
};

// r = 현재 상장주식수 ÷ (순이익 ÷ EPS) 의 일치 밴드. 경계값은 일치로 본다.
// 하한 0.6: 2:1 병합이 r≈0.5 — 이를 잡으면서 정상 범위와 거리를 둔다.
// 상한 2.0: EPS 분모가 자사주 제외 가중평균이라 정상 종목의 r 도 1 위쪽으로 치우친다.
const SHARE_BASIS_RATIO_MIN = 0.6;
const SHARE_BASIS_RATIO_MAX = 2.0;

// DART EPS 는 공시 당시 주식수 기준이라 병합·분할 뒤에는 현재 주가와 조합한 PER 이 배율만큼
// 틀린다. EPS 가 전제한 주식수(순이익 ÷ EPS)를 역산해 현재 상장주식수와 비교한다.
// 판정 불가(NULL·0·순이익과 EPS 부호 불일치)는 false — 표시를 유지한다.
export const isShareBasisMismatch = (
  netIncome: number | null,
  eps: number | null,
  currentShares: number | null
): boolean => {
  if (netIncome === null || eps === null || currentShares === null) return false;
  if (netIncome === 0 || eps === 0 || currentShares <= 0) return false;
  if ((netIncome > 0) !== (eps > 0)) return false;
  const r = currentShares / (netIncome / eps);
  return r < SHARE_BASIS_RATIO_MIN || r > SHARE_BASIS_RATIO_MAX;
};

// 12월 결산 전제 — 무상증자 등록 종목은 모두 12월 결산이다.
const PERIOD_END_MMDD: Readonly<Record<number, string>> = {
  1: "03-31",
  2: "06-30",
  3: "09-30",
  4: "12-31",
};

// 권리락일 전에 끝난 기간의 공시 EPS 는 무상증자 전 주식수 기준이다.
const isBeforeBonusExDate = (row: FinancialRow): boolean => {
  const exDate = getBonusIssueExDate(row.ticker);
  const quarter = row.report_type === "annual" ? 4 : row.quarter;
  if (exDate === null || quarter === null) return false;
  return `${row.year}-${PERIOD_END_MMDD[quarter]}` < exDate;
};

const isRowBasisMismatch = (row: FinancialRow, shares: number | null): boolean =>
  isShareBasisMismatch(row.net_income, row.eps, shares) || isBeforeBonusExDate(row);

const calcPbr = (close: number | undefined, bps: number | null): number | null => {
  if (close === undefined || bps === null || bps <= 0) return null;
  return close / bps;
};

// query-time 배당수익률 = dps / 현재가 (소수 규약, formatPercent 가 100× 하여 표시).
// DART 원본 dividendYield 는 결산 시점 시가 기준이라 별개 값.
export const calcDividendYield = (
  close: number | null,
  dps: number | null,
): number | null => {
  if (close === null || close <= 0) return null;
  if (dps === null || dps <= 0) return null;
  return dps / close;
};

// 핵심 지표 시가배당률 — 최신 연간 DPS ÷ 현재가. DPS 는 같은 회계연도 연간 기간에 붙어 있으므로
// 그 기간이 기준 주식수 불일치면 현재 주가와 조합하지 않는다 (DPS 표시 자체는 소비측 몫).
export const calcLatestDividendYield = (
  close: number | null,
  latestAnnual: FinancialPeriod | null
): number | null => {
  if (latestAnnual === null || latestAnnual.shareBasisMismatch) return null;
  return calcDividendYield(close, latestAnnual.dps);
};

// YoY 성장률 = (cur - prev) / prev. 소수 규약 (formatPercent 100×).
// 기준값이 0 이하이면 부호가 뒤집혀 의미 없어 null (흑자전환/적자전환은 표기하지 않는다).
export const calcGrowth = (cur: number | null, prev: number | null): number | null => {
  if (cur === null || prev === null || prev <= 0) return null;
  return (cur - prev) / prev;
};

// 입력 배열 내부에서 비교 행(annual: 전년, quarter: 전년 동분기)을 찾아 3필드 채움.
// 원본 배열/요소 불변, 입력 순서 그대로 반환. annual·quarterly 를 섞어 넣지 말 것.
export const attachGrowthRates = (
  periods: readonly FinancialPeriod[],
): FinancialPeriod[] => {
  const byKey = new Map<string, FinancialPeriod>();
  for (const p of periods) {
    byKey.set(`${p.year}-${p.quarter ?? "A"}`, p);
  }
  return periods.map((p) => {
    const prevKey = `${p.year - 1}-${p.quarter ?? "A"}`;
    const prev = byKey.get(prevKey);
    return {
      ...p,
      revenueGrowth: prev ? calcGrowth(p.revenue, prev.revenue) : null,
      operatingProfitGrowth: prev ? calcGrowth(p.operatingProfit, prev.operatingProfit) : null,
      netIncomeGrowth: prev ? calcGrowth(p.netIncome, prev.netIncome) : null,
    };
  });
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

// shares = 현재 상장주식수. null 이면 r 판정 불가 — 무상증자 등록 행 판정만 남는다.
const rowToFinancialPeriod = (
  row: FinancialRow,
  close?: number,
  prevRow?: FinancialRow | null,
  shares: number | null = null
): FinancialPeriod => {
  const shareBasisMismatch = isRowBasisMismatch(row, shares);
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
    per: shareBasisMismatch ? null : calcPer(close ?? null, row.eps),
    pbr: calcPbr(close, row.bps),
    ...calculateDerivedMetrics(raw, prevTotals),
    // 배당은 annual 만 채우며 attachDividends 가 병합. rowToFinancialPeriod
    // 단계에서는 항상 null (분기 행은 최종 null 유지, annual 행은 병합 대상).
    dps: null,
    payoutRatio: null,
    dividendYield: null,
    // 성장률은 attachGrowthRates 가 배열 단위로 채움.
    revenueGrowth: null,
    operatingProfitGrowth: null,
    netIncomeGrowth: null,
    shareBasisMismatch,
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
  prevAnnualRow: FinancialRow | null,
  shares: number | null
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
    result.push(rowToFinancialPeriod(row, close, prevRow, shares));
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

    // 파생 Q4 는 차감 노이즈가 커 자체 r 을 쓰지 않고 재료 행의 판정을 따른다. 연간이 일치여도
    // 빼는 Q1~Q3 중 하나가 다른 주식수 기준이면 차감 결과는 기준이 섞인 값이다.
    const q4Mismatch = [annualRow, q1, q2, q3].some(
      (row) => row !== undefined && isRowBasisMismatch(row, shares)
    );

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
      per: q4Mismatch ? null : calcPer(q4Close ?? null, q4Eps),
      pbr: calcPbr(q4Close, annualRow.bps),
      ...calculateDerivedMetrics(raw, q3PrevTotals),
      // 분기 행은 배당 null 유지.
      dps: null,
      payoutRatio: null,
      dividendYield: null,
      revenueGrowth: null,
      operatingProfitGrowth: null,
      netIncomeGrowth: null,
      shareBasisMismatch: q4Mismatch,
    });
  }

  return result.sort((a, b) => (a.quarter ?? 0) - (b.quarter ?? 0));
};

// 분기 PER = 분기말 종가 ÷ 그 분기까지 직전 4분기 EPS 합. 단분기 EPS 로 나누면 연간 PER 의 약 4배로
// 부풀어 연간 뷰와 비교할 수 없다 — buildQuarterlyPeriods 의 단분기 per 를 덮어쓴다.
// 4분기가 온전할 때(ttm)만 표시하고 연환산·연간 폴백은 쓰지 않는다. 합 ≤ 0·기준 불일치는 null.
// quarterly 는 최신순 단분기 전체 — 잘라서 넘기면 창 끝 3분기가 null 이 된다.
const attachQuarterlyTtmPer = (
  quarterly: FinancialPeriod[],
  priceMap: PriceMap
): FinancialPeriod[] =>
  quarterly.map((p, i) => {
    const ttm = computeTtmEps(quarterly.slice(i), null);
    const close = p.quarter === null ? null : (priceMap.get(priceKey(p.year, p.quarter)) ?? null);
    return { ...p, per: ttm.source === "ttm" ? calcPer(close, ttm.value) : null };
  });

// getFinancials 의 순수 코어. rows 는 조회 SQL 과 같은 year DESC·quarter DESC 정렬 전제.
// shares = 현재 상장주식수 (null 이면 r 판정 불가 — 무상증자 등록 행 판정만 남는다).
// export 는 테스트용 (다른 lib 에서 import 하지 말 것).
export const buildFinancials = (
  rows: readonly FinancialRow[],
  priceMap: PriceMap,
  dividendsByYear: ReadonlyMap<number, DividendMetrics>,
  shares: number | null
): StockFinancials => {
  const annualRows = rows.filter((r) => r.report_type === "annual").slice(0, 5);
  const quarterRows = rows.filter((r) => r.report_type === "quarter");

  // 연간: 해당 연도 마지막 거래일 종가 = Q4 마지막 거래일 종가
  // annualRows는 year DESC 정렬이므로 [i+1]이 전년도
  const annualBase = annualRows.map((row, i) => {
    const close = priceMap.get(priceKey(row.year, 4));
    const prevRow = annualRows[i + 1] ?? null;
    return rowToFinancialPeriod(row, close, prevRow, shares);
  });
  const annualWithDividends = attachDividends(annualBase, dividendsByYear);
  const annual = attachGrowthRates(annualWithDividends);

  // 연도별 그룹핑 후 단분기 변환
  const yearSet = new Set(quarterRows.map((r) => r.year));
  const quarterlyBase: FinancialPeriod[] = [];
  for (const year of yearSet) {
    const yearQuarters = quarterRows.filter((r) => r.year === year);
    const annualForYear = annualRows.find((r) => r.year === year) ?? null;
    const prevAnnualForYear = annualRows.find((r) => r.year === year - 1) ?? null;
    quarterlyBase.push(
      ...buildQuarterlyPeriods(yearQuarters, annualForYear, priceMap, prevAnnualForYear, shares)
    );
  }
  quarterlyBase.sort((a, b) => b.year - a.year || (b.quarter ?? 0) - (a.quarter ?? 0));
  const quarterly = attachGrowthRates(attachQuarterlyTtmPer(quarterlyBase, priceMap));

  return { annual, quarterly };
};

export const getFinancials = cache(async (ticker: string): Promise<StockFinancials> => {
  const [[rows], priceMap, dividendsByYear, shares] = await Promise.all([
    pool.query<FinancialRow[]>(
      "SELECT * FROM financial_statements WHERE ticker = $1 ORDER BY year DESC, quarter DESC",
      [ticker]
    ),
    fetchClosePricesByQuarter(ticker),
    getDividendsByYear(ticker),
    // 주식수 조회 실패는 기준 판정 불가로 강등 — 재무 섹션 전체를 죽이지 않는다.
    getShares(ticker).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[financials] shares load failed for ${ticker}: ${message}`);
      return null;
    }),
  ]);

  return buildFinancials(rows, priceMap, dividendsByYear, shares);
});

export const getLatestFinancial = async (ticker: string): Promise<FinancialPeriod | null> => {
  const [rows] = await pool.query<FinancialRow[]>(
    "SELECT * FROM financial_statements WHERE ticker = $1 AND report_type = 'annual' ORDER BY year DESC LIMIT 1",
    [ticker]
  );

  if (rows.length === 0) return null;
  return rowToFinancialPeriod(rows[0]);
};

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

// 값을 만든 기간 중 하나라도 기준 주식수가 어긋나면 합산 결과(부호 포함)보다 우선한다.
const BASIS_MISMATCH: TtmEps = { value: null, source: "basis_mismatch" };
const anyMismatch = (periods: readonly FinancialPeriod[]): boolean =>
  periods.some((p) => p.shareBasisMismatch);

export const computeTtmEps = (
  quarterly: FinancialPeriod[],
  latestAnnual: FinancialPeriod | null,
  listedAt: Date | null = null,
  now: Date = new Date()
): TtmEps => {
  const annualEps = latestAnnual?.eps ?? null;
  const annualFallback: TtmEps =
    annualEps === null
      ? { value: null, source: "none" }
      : latestAnnual?.shareBasisMismatch
        ? BASIS_MISMATCH
        : { value: annualEps, source: "annual_fallback" };

  const consecutive = countTopConsecutive(quarterly);

  // #1 / #2: 최근 4분기 완결
  if (consecutive === 4) {
    const used = quarterly.slice(0, 4);
    if (anyMismatch(used)) return BASIS_MISMATCH;
    const sum = sumFlow(used.map((q) => q.eps));
    if (sum === null) return annualFallback;
    return sum > 0
      ? { value: sum, source: "ttm" }
      : { value: null, source: "ttm_negative" };
  }

  // #3: 상장 1년 미만 & 최근부터 2~3분기 연속 → 연환산
  if (consecutive === 2 || consecutive === 3) {
    const monthsSinceListing =
      listedAt !== null ? (now.getTime() - listedAt.getTime()) / MS_PER_MONTH : null;
    const notYetFourQuarters =
      monthsSinceListing !== null && monthsSinceListing < RECENTLY_LISTED_MAX_MONTHS;
    if (notYetFourQuarters) {
      const used = quarterly.slice(0, consecutive);
      if (anyMismatch(used)) return BASIS_MISMATCH;
      const sum = sumFlow(used.map((q) => q.eps));
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
