import { cache } from "react";
import { pool } from "./db";
import type { StockPriceSnapshot } from "@/shared/types/stock";

type DailyPriceRow = {
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
import { format } from "date-fns";

export const getDailyPrices = async (
  ticker: string,
  limit = 365
): Promise<StockPriceSnapshot[]> => {
  const [rows] = await pool.query<DailyPriceRow[]>(
    "SELECT * FROM daily_prices WHERE ticker = $1 ORDER BY date DESC LIMIT $2",
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

export const getLatestPrice = cache(async (ticker: string): Promise<StockPriceSnapshot | null> => {
  const [rows] = await pool.query<DailyPriceRow[]>(
    "SELECT * FROM daily_prices WHERE ticker = $1 ORDER BY date DESC LIMIT 1",
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
});
