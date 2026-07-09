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

  // 세션/marketOpen 은 순수 KST 시계 — KIS 응답 무관. try 밖에서 계산해
  // catch 경로에서도 그대로 재사용 (초기 로드 스켈레톤 게이트 해소용).
  const session = getKrxSessionState();
  // 폴링 게이트: 활성 세션(regular/after/pre)만 true. after_close는 1회 호출 후 정지.
  const marketOpen =
    session === "regular" || session === "after" || session === "pre";

  try {
    let quotes: Record<string, StockQuote | null> = {};
    let failed: Record<string, boolean> = {};
    if (tickers.length > 0) {
      if (session === "regular") {
        ({ quotes, failed } = await fetchMultiQuote(tickers, "J"));
      } else if (
        session === "after" ||
        session === "after_close" ||
        session === "pre"
      ) {
        ({ quotes, failed } = await fetchMultiQuote(tickers, "NX"));
      }
      // preopen / closed: KIS 호출 스킵, quotes/failed 모두 {} 유지 (라이브 미시도 → 실패 개념 없음).
    }

    return NextResponse.json({ quotes, failed, marketOpen, session });
  } catch (err: unknown) {
    // 200 + quotes:{ticker:null...} + failed:{ticker:true...} 로 collapse.
    // single stock-quote(#077) 동형 — 소비측이 세션 라벨은 유지한 채 종목별 "일시 지연"
    // 배지로만 분기할 수 있게 한다.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[multi-quote] ${message}`);
    return NextResponse.json({
      quotes: Object.fromEntries(tickers.map((t) => [t, null])),
      failed: Object.fromEntries(tickers.map((t) => [t, true])),
      marketOpen,
      session,
    });
  }
};
