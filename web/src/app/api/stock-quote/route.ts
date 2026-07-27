import { type NextRequest, NextResponse } from "next/server";
import { fetchStockQuote } from "@/lib/kis-quote-fetch";
import {
  decideSingleSnapshot,
  fetchQuoteSnapshot,
  isSnapshotSession,
} from "@/lib/quoteSnapshots";
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
    // 오프아워(after_close/closed/preopen) 는 quote_snapshots 서빙 우선.
    // 캡처 실패(date 통째로 없음) 시 기존 KIS 경로로 fallback.
    // 부분 miss (해당 티커만 없음) 는 quote:null 로 서빙 — StockHeaderLivePrice
    // 의 isNxtMiss 판정이 live===null 경로에 의존하므로 UI 무변경.
    if (isSnapshotSession(session)) {
      const { row, dateExists } = await fetchQuoteSnapshot(ticker, date);
      const decision = decideSingleSnapshot(session, row, dateExists);
      if (decision.kind === "serve") {
        return NextResponse.json({
          quote: decision.quote,
          marketOpen,
          session,
          date,
          failed: false,
        });
      }
      // fallback: KIS 경로로 흘림
    }

    // 세션별 J/NX 토글 — StockHeaderLivePrice.isNxtMiss 는 after/after_close/pre/closed 에서
    // NX 응답이 null(비NXT 종목 iscd=null → normalizeStockQuote=null)인 경로에 의존.
    // UN 통합으로 바꾸면 KRX 값이 흘러가 배지가 "장 마감" 대신 "애프터마켓" 으로 회귀.
    // closed(주말·공휴일) NX 요청은 KIS 가 마지막 NXT 세션 종가(직전 거래일 20:00)를
    // 그대로 반환하는 특성에 의존 — NXT 종목은 애프터마켓 종가로 표시되고 비NXT 는
    // iscd=null → isNxtMiss → "장 마감" 라벨로 폴백.
    let quote: StockQuote | null = null;
    if (session === "regular") {
      quote = await fetchStockQuote(ticker, "J");
    } else if (
      session === "after" ||
      session === "after_close" ||
      session === "pre" ||
      session === "closed"
    ) {
      quote = await fetchStockQuote(ticker, "NX");
    }

    // 정규장 중 KIS 가 throw 없이 null 만 돌려준 경우만 실패로 취급 — 09:00~15:30 에는
    // KRX 상장 종목이면 응답이 있어야 정상. 그 외 세션은 실패/정상-빈응답(NXT 미지원)
    // 구분 불가라 여기서 실패 판정하지 않고 isNxtMiss("장 마감") 로 흘림.
    const failed = session === "regular" && quote === null;
    return NextResponse.json({ quote, marketOpen, session, date, failed });
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
