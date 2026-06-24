import { type NextRequest, NextResponse } from "next/server";
import { fetchStockQuote } from "@/lib/kis-quote-fetch";
import { getKrxSessionState } from "@/shared/utils/market";
import type { StockQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

export const GET = async (req: NextRequest) => {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker 파라미터가 필요합니다" }, { status: 400 });
  }

  try {
    const session = getKrxSessionState();
    // 폴링 게이트: 활성 세션(regular/after/pre)만 true. after_close는 1회 호출 후 정지.
    const marketOpen =
      session === "regular" || session === "after" || session === "pre";

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

    return NextResponse.json({ quote, marketOpen, session });
  } catch {
    return NextResponse.json(
      { error: "종목 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
