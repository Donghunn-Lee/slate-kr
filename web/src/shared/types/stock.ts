// 도메인 모델 (UI 소비용)

export type DartDisclosure = {
  rcpNo: string;
  disclosureNm: string;
  corpName: string;
  flrNm: string;
  rcptDt: string; // 'YYYYMMDD'
  rmk: string;
};

export type TickerDisclosureCount = {
  ticker: string;
  count: number | null;
};

export type StockSummary = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string | null;
  marketCap: number | null;
};

export type StockSearchResult = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

export type StockSearchPage = {
  results: StockSearchResult[];
  total: number;
};

export type CompanyProfile = {
  sectorName: string | null;
  homepageUrl: string | null;
};

export type StockPriceSnapshot = {
  ticker: string;
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  marketCap: number | null;
  // 등락 기준가(전일 15:30 정규장 종가). close 는 20:00 마감 캔들이라 인접 행 close 차이는
  // KIS 등락률 축과 어긋난다. null 인 행은 직전 거래일 close 로 폴백.
  basePrice: number | null;
};

export type TickerPriceSummary = {
  ticker: string;
  close: number;
  // 등락 기준가 — base_price(기준가), 없으면 직전 거래일 종가.
  basePrice: number | null;
  change: number | null;
  changePct: number | null;
  // close 가 속한 거래일.
  date: string;
};

export type FinancialPeriod = {
  ticker: string;
  year: number;
  quarter: number | null; // null = annual
  reportType: "annual" | "quarter";
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  eps: number | null;
  bps: number | null;
  per: number | null;
  pbr: number | null;
  // 파생 지표
  operatingMargin: number | null;
  netMargin: number | null;
  debtRatio: number | null;
  roe: number | null;
  roa: number | null;
  // 배당 (연간만 채움 — 분기 행은 항상 null)
  dps: number | null; // 주당현금배당금(원), 보통주
  payoutRatio: number | null; // (연결)현금배당성향(%)
  dividendYield: number | null; // DART 현금배당수익률(%), 결산 시점 시가배당률
  // 성장률 (전년 / 전년 동분기 대비, query-time 파생 — 비교 대상 부재·기준값 ≤ 0 이면 null)
  revenueGrowth: number | null;
  operatingProfitGrowth: number | null;
  netIncomeGrowth: number | null;
};

export type StockFinancials = {
  annual: FinancialPeriod[]; // 최신순 (최대 5년)
  quarterly: FinancialPeriod[]; // 최신순 단분기 (Q1~Q4)
};

export type PriceStats = {
  range52w: { high: number; low: number; current: number; position: number } | null;
  returns: { period: "1M" | "3M" | "1Y"; value: number | null }[];
};
