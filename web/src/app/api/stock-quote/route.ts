import { type NextRequest, NextResponse } from "next/server";
import { fetchStockQuote } from "@/lib/kis-quote-fetch";
import { getKrxSessionState, getKrxTradingDate } from "@/shared/utils/market";
import type { StockQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

export const GET = async (req: NextRequest) => {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker 파라미터가 필요합니다" }, { status: 400 });
  }

  // 세션/거래일은 순수 KST 시계 함수 — KIS 응답 무관. try 밖에서 계산해
  // catch 경로에서도 그대로 재사용 (초기 로드 스켈레톤 게이트 해소용).
  const session = getKrxSessionState();
  // 폴링 게이트: 활성 세션(regular/after/pre)만 true. after_close는 1회 호출 후 정지.
  const marketOpen =
    session === "regular" || session === "after" || session === "pre";
  const date = getKrxTradingDate();

  try {
    let quote: StockQuote | null = null;
    if (session === "regular") {
      quote = await fetchStockQuote(ticker, "J");
    } else if (
      session === "after" ||
      session === "after_close" ||
      session === "pre"
    ) {
      quote = await fetchStockQuote(ticker, "NX");
    }

    return NextResponse.json({ quote, marketOpen, session, date });
  } catch (err: unknown) {
    // 200 + quote:null 로 collapse — session=regular 인데 KIS null 경로와 shape 일치.
    // 클라이언트는 이미 이 shape 을 isStaleQuote("일시 지연") 로 소비하므로 UI 무변경으로 흡수.
    // 500 을 유지하면 첫 로드 시 session=undefined 로 스켈레톤이 무한 지속되는 관측성 홀 발생.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stock-quote] ${message}`);
    return NextResponse.json({ quote: null, marketOpen, session, date });
  }
};
