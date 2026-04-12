// DB 로우 타입
export type StockRow = {
  ticker: string;
  corp_code: string | null;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string | null;
  listed_at: Date | null;
  is_active: number;
  updated_at: Date;
};

export type DailyPriceRow = {
  id: number;
  ticker: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  market_cap: number | null;
};

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

// 도메인 모델 (UI 소비용)
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
