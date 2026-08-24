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

// pykrx 백필이 무거래일에 남긴 open=high=low=0 fill 봉(#120)을 서빙 경계에서 flat(close)로 정규화.
// DB 원본은 as-is 유지 — 캔들 축 붕괴·52주 저가 0원만 방지한다. 부분 0(예: open만 0)은 통과.
export const rowToSnapshot = (row: DailyPriceRow): StockPriceSnapshot => {
  const isFlatFill = row.open === 0 && row.high === 0 && row.low === 0;
  return {
    ticker: row.ticker,
    date: format(new Date(row.date), "yyyy-MM-dd"),
    open: isFlatFill ? row.close : row.open,
    high: isFlatFill ? row.close : row.high,
    low: isFlatFill ? row.close : row.low,
    close: row.close,
    volume: row.volume,
    marketCap: row.market_cap,
  };
};

export const getDailyPrices = async (
  ticker: string,
  limit = 365
): Promise<StockPriceSnapshot[]> => {
  const [rows] = await pool.query<DailyPriceRow[]>(
    "SELECT * FROM daily_prices WHERE ticker = $1 ORDER BY date DESC LIMIT $2",
    [ticker, limit]
  );

  return rows.map(rowToSnapshot);
};

export const getLatestPrice = cache(async (ticker: string): Promise<StockPriceSnapshot | null> => {
  const [rows] = await pool.query<DailyPriceRow[]>(
    "SELECT * FROM daily_prices WHERE ticker = $1 ORDER BY date DESC LIMIT 1",
    [ticker]
  );

  if (rows.length === 0) return null;

  return rowToSnapshot(rows[0]);
});

// tickers 각각의 최신 종가·전일 대비 등락·거래량. change 컬럼이 스키마에 없어(2026-07 확인)
// LAG 로 직전 거래일 종가를 붙여 파생 계산한다. 10일 lookback 은 연휴/휴장 갭 대비.
// 결과에서 누락된 ticker(시세 없음)는 caller 가 부재로 처리한다.
export type LatestPriceSummary = {
  close: number;
  change: number | null;
  changeRate: number | null;
  volume: number;
};

type LatestPriceRow = {
  ticker: string;
  close: number;
  volume: number;
  prev_close: number | null;
};

export const getLatestPricesByTickers = async (
  tickers: string[]
): Promise<Record<string, LatestPriceSummary>> => {
  if (tickers.length === 0) return {};

  const placeholders = tickers.map((_, i) => `$${i + 1}`).join(",");

  const [rows] = await pool.query<LatestPriceRow[]>(
    `WITH ranked AS (
       SELECT ticker, close, volume,
              LAG(close) OVER (PARTITION BY ticker ORDER BY date) AS prev_close,
              ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY date DESC) AS rn
       FROM daily_prices
       WHERE ticker IN (${placeholders})
         AND date >= CURRENT_DATE - INTERVAL '10 days'
     )
     SELECT ticker, close, volume, prev_close
     FROM ranked
     WHERE rn = 1`,
    tickers
  );

  const result: Record<string, LatestPriceSummary> = {};
  for (const row of rows) {
    const prev = row.prev_close;
    const change = prev === null ? null : row.close - prev;
    const changeRate =
      prev === null || prev === 0 ? null : ((row.close - prev) / prev) * 100;
    result[row.ticker] = {
      close: row.close,
      change,
      changeRate,
      volume: row.volume,
    };
  }
  return result;
};

export const getPricesForStats = async (ticker: string): Promise<StockPriceSnapshot[]> => {
  try {
    const [rows] = await pool.query<DailyPriceRow[]>(
      "SELECT * FROM daily_prices WHERE ticker = $1 AND date >= CURRENT_DATE - INTERVAL '13 months' ORDER BY date ASC",
      [ticker]
    );
    return rows.map(rowToSnapshot);
  } catch {
    return [];
  }
};

// 계산에 필요한 최소 필드만 요구 — 지수(IndexDailySnapshot) 등 다른 도메인 시계열도
// 구조적으로 그대로 투입 가능. 종목 호출부는 StockPriceSnapshot 이 상위 타입이므로 무영향.
export type PriceStatsInput = Pick<StockPriceSnapshot, "date" | "high" | "low" | "close">;

export const getPriceStats = (prices: PriceStatsInput[]): PriceStats => {
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

  const oldestDate = prices[0].date;
  const cutoff1M = format(subMonths(lastDate, 1), "yyyy-MM-dd");
  const cutoff3M = format(subMonths(lastDate, 3), "yyyy-MM-dd");
  const cutoff1Y = format(subYears(lastDate, 1), "yyyy-MM-dd");

  // 52주 극값은 fetch 창(종목 13개월 / 지수 최대 1000일)이 아닌 실제 365일 창에서만 산출.
  // cutoff 는 오늘이 아니라 마지막 봉 date 기준 (결정적·테스트 용이).
  const range52wSource = prices.filter((p) => p.date >= cutoff1Y);
  const high52 = Math.max(...range52wSource.map((p) => p.high));
  const low52 = Math.min(...range52wSource.map((p) => p.low));
  const position = high52 === low52 ? 0 : (current - low52) / (high52 - low52);

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
