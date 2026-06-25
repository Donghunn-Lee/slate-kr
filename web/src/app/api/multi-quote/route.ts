import { type NextRequest, NextResponse } from "next/server";
import { fetchMultiQuote } from "@/lib/kis-quote-fetch";
import { getKrxSessionState } from "@/shared/utils/market";
import type { StockQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

const MULTI_QUOTE_LIMIT = 30; // KIS 공식 상한 (fetcher와 동일 방어)

export const GET = async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).slice(0, MULTI_QUOTE_LIMIT);

  try {
    const session = getKrxSessionState();
    // 폴링 게이트: 활성 세션(regular/after/pre)만 true. after_close는 1회 호출 후 정지.
    const marketOpen =
      session === "regular" || session === "after" || session === "pre";

    let quotes: Record<string, StockQuote | null> = {};
    if (tickers.length > 0) {
      if (session === "regular") {
        quotes = await fetchMultiQuote(tickers, "J");
      } else if (
        session === "after" ||
        session === "after_close" ||
        session === "pre"
      ) {
        quotes = await fetchMultiQuote(tickers, "NX");
      }
      // preopen / closed: KIS 호출 스킵, quotes는 {} 유지
    }

    return NextResponse.json({ quotes, marketOpen, session });
  } catch {
    return NextResponse.json(
      { error: "멀티 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
