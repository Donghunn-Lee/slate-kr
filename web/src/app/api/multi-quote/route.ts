import { type NextRequest, NextResponse } from "next/server";
import { fetchMultiQuote } from "@/lib/kis-quote-fetch";
import {
  decideMultiSnapshot,
  fetchQuoteSnapshots,
  isSnapshotSession,
} from "@/lib/quoteSnapshots";
import { getMarketCalendar } from "@/lib/marketCalendar";
import { getKrxSessionState, getKrxTradingDate } from "@/shared/utils/market";
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

  // 요청 시작에서 캘린더 1회 로드 (memo). 세션·거래일 산출에 관통.
  const calendar = await getMarketCalendar();
  const now = new Date();
  // 세션/marketOpen 은 순수 KST 시계 — KIS 응답 무관. try 밖에서 계산해
  // catch 경로에서도 그대로 재사용 (초기 로드 스켈레톤 게이트 해소용).
  const session = getKrxSessionState(now, calendar);
  // 폴링 게이트: 활성 세션(regular/after/pre)만 true. after_close는 1회 호출 후 정지.
  const marketOpen =
    session === "regular" || session === "after" || session === "pre";
  const date = getKrxTradingDate(now, calendar);

  try {
    let quotes: Record<string, StockQuote | null> = {};
    let failed: Record<string, boolean> = {};
    if (tickers.length > 0) {
      // 오프아워(after_close/closed/preopen) 는 quote_snapshots 서빙 우선.
      // 캡처 실패(date 통째로 없음) 시 기존 KIS 경로로 fallback.
      // 부분 miss (해당 티커 row 없음, 또는 비NXT nx_eligible=false) 는 quote:null
      // 로 서빙 — WatchlistRow 는 live 없으면 EOD price 로 자연 폴백.
      let snapshotServed = false;
      if (isSnapshotSession(session)) {
        const { byTicker, dateExists } = await fetchQuoteSnapshots(tickers, date);
        const decision = decideMultiSnapshot(session, tickers, byTicker, dateExists);
        if (decision.kind === "serve") {
          for (const t of tickers) {
            quotes[t] = decision.byTicker[t] ?? null;
            failed[t] = false;
          }
          snapshotServed = true;
        }
      }

      if (!snapshotServed) {
        // UN(KRX+NXT 통합) 단일 호출. stock-quote route 와 동일 근거.
        if (
          session === "regular" ||
          session === "after" ||
          session === "after_close" ||
          session === "pre"
        ) {
          ({ quotes, failed } = await fetchMultiQuote(tickers));
        }
        // preopen / closed: KIS 호출 스킵, quotes/failed 모두 {} 유지 (라이브 미시도 → 실패 개념 없음).
      }
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
