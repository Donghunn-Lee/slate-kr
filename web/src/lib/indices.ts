import { cache } from "react";
import { format } from "date-fns";
import { pool } from "./db";
import { fetchIndexIntradayChart } from "./kis-quote-fetch";
import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
} from "@/shared/types/quote";

type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";

const ISCD_BY_INDEX: Record<IndexCode, string> = {
  KOSPI: "0001",
  KOSDAQ: "1001",
  KOSPI200: "2001",
};

type DailyIndexRow = {
  base_date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  change_rate: number;
};

const toSnapshot = (indexCode: string, row: DailyIndexRow): IndexDailySnapshot => ({
  indexCode,
  date: format(new Date(row.base_date), "yyyy-MM-dd"),
  open: row.open,
  high: row.high,
  low: row.low,
  close: row.close,
  change: row.change,
  changeRate: row.change_rate,
});

export const getLatestIndexPrice = cache(
  async (indexCode: string): Promise<IndexDailySnapshot | null> => {
    const [rows] = await pool.query<DailyIndexRow[]>(
      "SELECT base_date, open, high, low, close, change, change_rate FROM index_daily_prices WHERE index_code = $1 ORDER BY base_date DESC LIMIT 1",
      [indexCode]
    );
    if (rows.length === 0) return null;
    return toSnapshot(indexCode, rows[0]);
  }
);

// 인트라데이(10분봉) 가져와서 전일 종가 기준 change/changeRate 채워서 반환.
// 전일 종가는 index_daily_prices 직전 영업일 close 사용. cron이 아직 어제 데이터를
// 적재 못 했다면 null이라 change=0 — UI는 차트만 그릴 거라 영향 없음.
export const getIndexIntradayPrices = async (
  indexCode: IndexCode,
): Promise<IndexIntradaySnapshot[]> => {
  const [bars, prev] = await Promise.all([
    fetchIndexIntradayChart(ISCD_BY_INDEX[indexCode]),
    getLatestIndexPrice(indexCode),
  ]);
  if (!bars) return [];
  const prevClose = prev?.close ?? 0;
  return bars.map((bar) => {
    const change = prevClose > 0 ? bar.close - prevClose : 0;
    const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return {
      indexCode,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      change,
      changeRate,
    };
  });
};

export const getIndexDailyPrices = async (
  indexCode: string,
  limit = 365
): Promise<IndexDailySnapshot[]> => {
  // 최신 N건을 가져온 뒤 차트가 소비하기 좋게 ASC로 뒤집는다.
  const [rows] = await pool.query<DailyIndexRow[]>(
    "SELECT base_date, open, high, low, close, change, change_rate FROM index_daily_prices WHERE index_code = $1 ORDER BY base_date DESC LIMIT $2",
    [indexCode, limit]
  );
  return rows.reverse().map((row) => toSnapshot(indexCode, row));
};
