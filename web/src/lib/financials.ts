import type { RowDataPacket } from "mysql2";
import pool from "./db";
import type { FinancialRow, StockFinancialSummary } from "@/shared/types/stock";

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
