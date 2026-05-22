import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

type PriceRow = {
  ticker: string;
  close: number;
  date: string;
};

export type TickerPriceSummary = {
  ticker: string;
  close: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
};

// GET /api/prices?tickers=005930,000660,035420
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20); // 최대 20개

  if (tickers.length === 0) {
    return NextResponse.json([]);
  }

  try {
    const placeholders = tickers.map((_, i) => `$${i + 1}`).join(",");

    const [rows] = await pool.query<PriceRow[]>(
      `SELECT p1.ticker, p1.close, p1.date
       FROM daily_prices p1
       INNER JOIN (
         SELECT ticker, MAX(date) AS max_date
         FROM daily_prices
         WHERE ticker IN (${placeholders})
         GROUP BY ticker
       ) latest ON p1.ticker = latest.ticker AND p1.date = latest.max_date
       ORDER BY p1.ticker`,
      tickers
    );

    // 이전 종가: 종목별로 최신 날짜 이전 1건, 개별 실패는 null 처리
    const prevResults = await Promise.allSettled(
      rows.map(async (row) => {
        const [prev] = await pool.query<PriceRow[]>(
          "SELECT close FROM daily_prices WHERE ticker = $1 AND date < $2 ORDER BY date DESC LIMIT 1",
          [row.ticker, row.date]
        );
        return { ticker: row.ticker, prevClose: prev[0]?.close ?? null };
      })
    );

    const prevMap = Object.fromEntries(
      prevResults.map((result, i) => [
        rows[i].ticker,
        result.status === "fulfilled" ? result.value.prevClose : null,
      ])
    );

    const response: TickerPriceSummary[] = rows.map((row) => {
      const prevClose = prevMap[row.ticker] ?? null;
      const change = prevClose !== null ? row.close - prevClose : null;
      const changePct = prevClose !== null && prevClose !== 0 ? (change! / prevClose) * 100 : null;
      return { ticker: row.ticker, close: row.close, prevClose, change, changePct };
    });

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "가격 데이터를 불러오지 못했습니다" }, { status: 500 });
  }
}
