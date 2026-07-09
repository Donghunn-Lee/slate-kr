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

    return NextResponse.json({
      quote,
      marketOpen,
      session,
      date,
      failed: false,
    });
  } catch (err: unknown) {
    // 200 + quote:null 로 collapse — 첫 로드 시 session=undefined 스켈레톤 홀 해소.
    // failed=true 로 정상 quote:null(NXT 미지원 등) 과 KIS 실패를 구분해 클라이언트가
    // 세션 라벨(애프터마켓 등) 을 유지한 채 "일시 지연" 배지만 얹을 수 있게 한다.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stock-quote] ${message}`);
    return NextResponse.json({
      quote: null,
      marketOpen,
      session,
      date,
      failed: true,
    });
  }
};
