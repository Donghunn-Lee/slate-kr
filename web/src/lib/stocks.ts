import { cache } from "react";
import { pool } from "./db";
import { getLatestPrice } from "./prices";
import type { StockSearchPage, StockSummary } from "@/shared/types/stock";

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

export const getListedAt = cache(async (ticker: string): Promise<Date | null> => {
  const [rows] = await pool.query<Pick<StockRow, "listed_at">[]>(
    "SELECT listed_at FROM stocks WHERE ticker = $1 AND is_active = true",
    [ticker]
  );
  return rows.length > 0 ? (rows[0].listed_at ?? null) : null;
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

type SearchOptions = {
  limit?: number;
  offset?: number;
};

export const searchStocks = async (
  query: string,
  opts: SearchOptions = {}
): Promise<StockSearchPage> => {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;

  const containsPattern = `%${query}%`;
  const prefixPattern = `${query}%`;

  const [rows] = await pool.query<Pick<StockRow, "ticker" | "name" | "market">[]>(
    `SELECT ticker, name, market
     FROM stocks
     WHERE (name ILIKE $1 OR ticker ILIKE $2) AND is_active = true
     ORDER BY (name ILIKE $3 OR ticker ILIKE $4) DESC, name ASC
     LIMIT $5 OFFSET $6`,
    [containsPattern, containsPattern, prefixPattern, prefixPattern, limit + 1, offset]
  );

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  return {
    results: trimmed.map((row) => ({
      ticker: row.ticker,
      name: row.name,
      market: row.market,
    })),
    hasMore,
  };
};
