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
  // close 가 속한 거래일.
  date: string;
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
      // date 는 to_char 로 문자열 수신 — Neon HTTP 가 DATE 를 로컬 midnight Date 로
      // 파싱해 환경 TZ 만큼 어긋나는 경로를 차단한다.
      `SELECT p1.ticker, p1.close, to_char(p1.date, 'YYYY-MM-DD') AS date
       FROM daily_prices p1
       INNER JOIN (
         SELECT ticker, MAX(date) AS max_date
         FROM daily_prices
         WHERE ticker IN (${placeholders})
         GROUP BY ticker
       ) latest ON p1.ticker = latest.ticker AND p1.date = latest.max_date
       INNER JOIN stocks s ON s.ticker = p1.ticker AND s.is_active = true
       ORDER BY p1.ticker`,
      tickers
    );

    // 이전 종가: 종목별 lookback, 개별 실패는 null 처리
    const lookbackResults = await Promise.allSettled(
      rows.map(async (row) => {
        const [prev] = await pool.query<PriceRow[]>(
          "SELECT close FROM daily_prices WHERE ticker = $1 AND date < $2 ORDER BY date DESC LIMIT 1",
          [row.ticker, row.date]
        );
        return {
          ticker: row.ticker,
          prevClose: prev[0]?.close ?? null,
        };
      })
    );

    const lookbackMap = Object.fromEntries(
      lookbackResults.map((result, i) => [
        rows[i].ticker,
        result.status === "fulfilled"
          ? { prevClose: result.value.prevClose }
          : { prevClose: null },
      ])
    );

    const computeChange = (
      current: number,
      basis: number | null
    ): { change: number | null; changePct: number | null } => {
      if (basis === null) return { change: null, changePct: null };
      const change = current - basis;
      const changePct = basis === 0 ? null : (change / basis) * 100;
      return { change, changePct };
    };

    const response: TickerPriceSummary[] = rows.map((row) => {
      const { prevClose } = lookbackMap[row.ticker];
      const { change, changePct } = computeChange(row.close, prevClose);
      return {
        ticker: row.ticker,
        close: row.close,
        prevClose,
        change,
        changePct,
        date: row.date,
      };
    });

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "가격 데이터를 불러오지 못했습니다" }, { status: 500 });
  }
}
