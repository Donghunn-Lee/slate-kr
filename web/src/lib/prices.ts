import type { RowDataPacket } from "mysql2";
import pool from "./db";
import type { DailyPriceRow, StockPriceSnapshot } from "@/shared/types/stock";
import { format } from "date-fns";

export const getDailyPrices = async (
  ticker: string,
  limit = 365
): Promise<StockPriceSnapshot[]> => {
  const [rows] = await pool.query<(DailyPriceRow & RowDataPacket)[]>(
    "SELECT * FROM daily_prices WHERE ticker = ? ORDER BY date DESC LIMIT ?",
    [ticker, limit]
  );

  return rows.map((row) => ({
    ticker: row.ticker,
    date: format(new Date(row.date), "yyyy-MM-dd"),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    marketCap: row.market_cap,
  }));
};

export const getLatestPrice = async (ticker: string): Promise<StockPriceSnapshot | null> => {
  const [rows] = await pool.query<(DailyPriceRow & RowDataPacket)[]>(
    "SELECT * FROM daily_prices WHERE ticker = ? ORDER BY date DESC LIMIT 1",
    [ticker]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ticker: row.ticker,
    date: format(new Date(row.date), "yyyy-MM-dd"),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    marketCap: row.market_cap,
  };
};
