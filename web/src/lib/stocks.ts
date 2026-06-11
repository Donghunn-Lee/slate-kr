import { cache } from "react";
import { pool } from "./db";
import { getLatestPrice } from "./prices";
import type { StockSummary } from "@/shared/types/stock";

type StockRow = {
  ticker: string;
  corp_code: string | null;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string | null;
  shares: bigint | null;
  listed_at: Date | null;
  is_active: number;
  updated_at: Date;
};

export const getStockByTicker = cache(async (ticker: string): Promise<StockSummary | null> => {
  const [rows] = await pool.query<StockRow[]>(
    "SELECT ticker, name, market, sector, shares FROM stocks WHERE ticker = $1 AND is_active = true",
    [ticker]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const latestPrice = await getLatestPrice(row.ticker);
  const marketCap =
    row.shares != null && latestPrice != null ? Number(row.shares) * latestPrice.close : null;

  return {
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    sector: row.sector,
    marketCap,
  };
});

export const getCorpCode = cache(async (ticker: string): Promise<string | null> => {
  const [rows] = await pool.query<StockRow[]>(
    "SELECT corp_code FROM stocks WHERE ticker = $1 AND is_active = true",
    [ticker]
  );
  return rows.length > 0 ? (rows[0].corp_code ?? null) : null;
});

export const getAllTickers = async (): Promise<string[]> => {
  const [rows] = await pool.query<Pick<StockRow, "ticker">[]>(
    "SELECT ticker FROM stocks WHERE is_active = true"
  );
  return rows.map((row) => row.ticker);
};

export const searchStocks = async (query: string): Promise<StockSummary[]> => {
  const [rows] = await pool.query<StockRow[]>(
    "SELECT ticker, name, market, sector FROM stocks WHERE (name ILIKE $1 OR ticker ILIKE $2) AND is_active = true LIMIT 10",
    [`%${query}%`, `%${query}%`]
  );

  return rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    sector: row.sector,
    marketCap: null,
  }));
};
