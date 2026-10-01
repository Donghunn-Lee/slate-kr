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
  shares: number | null;
  listed_at: Date | null;
  is_active: number;
  updated_at: Date;
};

type ActiveStockRow = Pick<StockRow, "ticker" | "name" | "market" | "sector" | "shares">;

// getStockByTicker·getShares 가 공유하는 요청 단위 조회 — 한 요청에서 stocks 행을 한 번만 읽는다.
const getActiveStockRow = cache(async (ticker: string): Promise<ActiveStockRow | null> => {
  const [rows] = await pool.query<ActiveStockRow[]>(
    "SELECT ticker, name, market, sector, shares FROM stocks WHERE ticker = $1 AND is_active = true",
    [ticker]
  );
  return rows[0] ?? null;
});

export const getStockByTicker = cache(async (ticker: string): Promise<StockSummary | null> => {
  const row = await getActiveStockRow(ticker);
  if (!row) return null;

  const latestPrice = await getLatestPrice(row.ticker);
  const marketCap =
    row.shares != null && Number(row.shares) > 0 && latestPrice != null
      ? Number(row.shares) * latestPrice.close
      : null;

  return {
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    sector: row.sector,
    marketCap,
  };
});

// 현재 상장주식수(KRX). 재무 정규화의 EPS 기준 주식수 판정 입력 — 종목 페이지는 layout·metadata 가
// 이미 getStockByTicker 를 호출하므로 같은 요청 캐시를 타 추가 쿼리가 없다.
export const getShares = async (ticker: string): Promise<number | null> => {
  const row = await getActiveStockRow(ticker);
  if (row?.shares == null || Number(row.shares) <= 0) return null;
  return Number(row.shares);
};

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

// 활성 종목의 ticker → 시장 구분. 결과에서 누락된 ticker 는 caller 가 부재로 처리한다.
export const getMarketsByTickers = async (
  tickers: string[]
): Promise<Map<string, StockSummary["market"]>> => {
  const placeholders = tickers.map((_, i) => `$${i + 1}`).join(",");
  const [rows] = await pool.query<Pick<StockRow, "ticker" | "market">[]>(
    `SELECT ticker, market FROM stocks WHERE ticker IN (${placeholders}) AND is_active = true`,
    tickers
  );
  return new Map(rows.map((r) => [r.ticker, r.market]));
};

type SearchOptions = {
  limit?: number;
  offset?: number;
};

type SearchRow = Pick<StockRow, "ticker" | "name" | "market"> & {
  total_count: number;
};

// total_count 는 offset 창에 결과가 있을 때만 회수 가능. 빈 페이지(offset이 total 초과)
// 시 0 으로 반환되므로, 호출측이 page > 1 && results.length === 0 → 1페이지 redirect
// 로 범위 밖 상태를 복구한다.
export const searchStocks = async (
  query: string,
  opts: SearchOptions = {}
): Promise<StockSearchPage> => {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;

  const containsPattern = `%${query}%`;
  const prefixPattern = `${query}%`;

  const [rows] = await pool.query<SearchRow[]>(
    `SELECT ticker, name, market, COUNT(*) OVER() AS total_count
     FROM stocks
     WHERE (name ILIKE $1 OR ticker ILIKE $2) AND is_active = true
     ORDER BY (name ILIKE $3 OR ticker ILIKE $4) DESC, name ASC
     LIMIT $5 OFFSET $6`,
    [containsPattern, containsPattern, prefixPattern, prefixPattern, limit, offset]
  );

  const total = rows.length > 0 ? rows[0].total_count : 0;

  return {
    results: rows.map((row) => ({
      ticker: row.ticker,
      name: row.name,
      market: row.market,
    })),
    total,
  };
};
