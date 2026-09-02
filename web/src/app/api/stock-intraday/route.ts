import { type NextRequest, NextResponse } from "next/server";
import {
  fetchStockIntradayChart,
  type StockIntradayChartResult,
} from "@/lib/kis-quote-fetch";
import { getMarketCalendar } from "@/lib/marketCalendar";
import { getKrxSessionState, getKrxTradingDate } from "@/shared/utils/market";

export const dynamic = "force-dynamic";

// 동시 요청 dedup 만 — 순차 요청은 항상 KIS 직행. 클라 폴링(60s) 이 자연 rate limiter.
// key 는 ticker 단일: fetchStockIntradayChart 가 내부 now() 로 session 을 재계산하므로
// 동시 요청은 caller session 과 무관하게 같은 응답을 공유해도 안전.
const inflight = new Map<
  string,
  Promise<StockIntradayChartResult | null>
>();

const dedupedFetch = (
  ticker: string,
): Promise<StockIntradayChartResult | null> => {
  const existing = inflight.get(ticker);
  if (existing) return existing;
  const promise = fetchStockIntradayChart(ticker).finally(() => {
    inflight.delete(ticker);
  });
  inflight.set(ticker, promise);
  return promise;
};

export const GET = async (req: NextRequest) => {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker 파라미터가 필요합니다" },
      { status: 400 },
    );
  }

  // 요청 시작에서 캘린더 1회 로드 (memo). 세션·거래일 산출에 관통.
  // fetchStockIntradayChart 내부의 시계 함수는 함수 스코프에서 자체 로드 (memo hit).
  const calendar = await getMarketCalendar();
  const now = new Date();
  const session = getKrxSessionState(now, calendar);
  // fallback 응답 date — 실패 시 세션 기준 오늘/직전 거래일. 성공 시 result.tradingDate 사용.
  const fallbackDate = getKrxTradingDate(now, calendar);

  try {
    const result = await dedupedFetch(ticker);
    // null = fetch 실패 (자격/토큰/전체 fan-out 실패). bars 는 [] 로 정규화해 클라 계약
    // (bars: ChartBar[]) 유지. failed:true 로 정상 empty 와 구분.
    if (result === null) {
      return NextResponse.json({
        bars: [],
        session,
        date: fallbackDate,
        previousDay: false,
        failed: true,
      });
    }
    return NextResponse.json({
      bars: result.bars,
      session,
      date: result.tradingDate,
      previousDay: result.previousDay,
      failed: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stock-intraday] ${message}`);
    return NextResponse.json(
      {
        bars: [],
        session,
        date: fallbackDate,
        previousDay: false,
        failed: true,
      },
      { status: 200 },
    );
  }
};
