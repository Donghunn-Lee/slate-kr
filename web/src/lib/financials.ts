import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import type { StockFinancialSummary } from "@/shared/types/stock";

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

export const getFinancials = async (ticker: string): Promise<StockFinancialSummary[]> => {
  const [rows] = await pool.query<(FinancialRow & RowDataPacket)[]>(
    "SELECT * FROM financial_statements WHERE ticker = ? ORDER BY year DESC, quarter DESC",
    [ticker]
  );

  return rows.map((row) => ({
    ticker: row.ticker,
    year: row.year,
    reportType: row.report_type,
    revenue: row.revenue,
    operatingProfit: row.operating_profit,
    netIncome: row.net_income,
    totalAssets: row.total_assets,
    totalEquity: row.total_equity,
    eps: row.eps,
    bps: row.bps,
  }));
};

export const getLatestFinancial = async (ticker: string): Promise<StockFinancialSummary | null> => {
  const [rows] = await pool.query<(FinancialRow & RowDataPacket)[]>(
    'SELECT * FROM financial_statements WHERE ticker = ? AND report_type = "annual" ORDER BY year DESC LIMIT 1',
    [ticker]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ticker: row.ticker,
    year: row.year,
    reportType: row.report_type,
    revenue: row.revenue,
    operatingProfit: row.operating_profit,
    netIncome: row.net_income,
    totalAssets: row.total_assets,
    totalEquity: row.total_equity,
    eps: row.eps,
    bps: row.bps,
  };
};
