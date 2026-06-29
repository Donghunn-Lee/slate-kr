import { cache } from "react";
import { format } from "date-fns";
import { pool } from "./db";
import type { IndexDailySnapshot } from "@/shared/types/quote";

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
