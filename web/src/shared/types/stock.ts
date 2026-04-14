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

export type StockFinancialSummary = {
  ticker: string;
  year: number;
  reportType: "annual" | "quarter";
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  eps: number | null;
  bps: number | null;
};
