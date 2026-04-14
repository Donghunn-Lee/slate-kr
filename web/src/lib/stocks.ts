import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import type { StockSummary } from "@/shared/types/stock";

type StockRow = {
  ticker: string;
  corp_code: string | null;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string | null;
  listed_at: Date | null;
  is_active: number;
  updated_at: Date;
};

export const getStockByTicker = async (ticker: string): Promise<StockSummary | null> => {
  const [rows] = await pool.query<(StockRow & RowDataPacket)[]>(
    "SELECT ticker, name, market, sector FROM stocks WHERE ticker = ? AND is_active = 1",
    [ticker]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    sector: row.sector,
  };
};

export const getCorpCode = async (ticker: string): Promise<string | null> => {
  const [rows] = await pool.query<(StockRow & RowDataPacket)[]>(
    "SELECT corp_code FROM stocks WHERE ticker = ? AND is_active = 1",
    [ticker]
  );
  return rows.length > 0 ? (rows[0].corp_code ?? null) : null;
};

export const searchStocks = async (query: string): Promise<StockSummary[]> => {
  const [rows] = await pool.query<(StockRow & RowDataPacket)[]>(
    "SELECT ticker, name, market, sector FROM stocks WHERE (name LIKE ? OR ticker LIKE ?) AND is_active = 1 LIMIT 10",
    [`%${query}%`, `%${query}%`]
  );

  return rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    sector: row.sector,
  }));
};
