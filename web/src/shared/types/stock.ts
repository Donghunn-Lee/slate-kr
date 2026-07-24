// 도메인 모델 (UI 소비용)

export type DartDisclosure = {
  rcpNo: string;
  disclosureNm: string;
  corpName: string;
  flrNm: string;
  rcptDt: string; // 'YYYYMMDD'
  rmk: string;
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
};

export type StockFinancials = {
  annual: FinancialPeriod[]; // 최신순 (최대 5년)
  quarterly: FinancialPeriod[]; // 최신순 단분기 (Q1~Q4)
};

export type PriceStats = {
  range52w: { high: number; low: number; current: number; position: number } | null;
  returns: { period: "1M" | "3M" | "1Y"; value: number | null }[];
};
