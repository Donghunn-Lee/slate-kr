import { cache } from "react";
import { pool } from "./db";
import type { PriceStats, StockPriceSnapshot } from "@/shared/types/stock";
import { format, parseISO, subMonths, subYears } from "date-fns";

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

export const getPricesForStats = async (ticker: string): Promise<StockPriceSnapshot[]> => {
  try {
    const [rows] = await pool.query<DailyPriceRow[]>(
      "SELECT * FROM daily_prices WHERE ticker = $1 AND date >= CURRENT_DATE - INTERVAL '13 months' ORDER BY date ASC",
      [ticker]
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
  } catch {
    return [];
  }
};

export const getPriceStats = (prices: StockPriceSnapshot[]): PriceStats => {
  if (prices.length === 0) {
    return {
      range52w: null,
      returns: [
        { period: "1M", value: null },
        { period: "3M", value: null },
        { period: "1Y", value: null },
      ],
    };
  }

  const last = prices[prices.length - 1];
  const current = last.close;
  const lastDate = parseISO(last.date);

  const high52 = Math.max(...prices.map((p) => p.high));
  const low52 = Math.min(...prices.map((p) => p.low));
  const position = high52 === low52 ? 0 : (current - low52) / (high52 - low52);

  const oldestDate = prices[0].date;
  const cutoff1M = format(subMonths(lastDate, 1), "yyyy-MM-dd");
  const cutoff3M = format(subMonths(lastDate, 3), "yyyy-MM-dd");
  const cutoff1Y = format(subYears(lastDate, 1), "yyyy-MM-dd");

  // 기간 시작일 이전 데이터가 없으면 폴백하지 않고 null 반환 (상장 1년 미만 종목 대응)
  const calcReturn = (cutoff: string): number | null => {
    if (oldestDate > cutoff) return null;
    const basis = prices.find((p) => p.date >= cutoff);
    if (basis === undefined) return null;
    return ((current - basis.close) / basis.close) * 100;
  };

  return {
    range52w: { high: high52, low: low52, current, position },
    returns: [
      { period: "1M", value: calcReturn(cutoff1M) },
      { period: "3M", value: calcReturn(cutoff3M) },
      { period: "1Y", value: calcReturn(cutoff1Y) },
    ],
  };
};
