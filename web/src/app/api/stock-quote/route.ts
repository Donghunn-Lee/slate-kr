import { type NextRequest, NextResponse } from "next/server";
import { fetchStockQuote } from "@/lib/kis-quote-fetch";
import {
  decideSingleSnapshot,
  fetchQuoteSnapshot,
  isSnapshotSession,
} from "@/lib/quoteSnapshots";
import { getKrxSessionState, getKrxTradingDate } from "@/shared/utils/market";
import type { QuoteMarket } from "@/shared/utils/market";
import type { StockQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

const parseMarket = (raw: string | null): QuoteMarket | null => {
  if (raw === "krx" || raw === "nxt") return raw;
  return null;
};

export const GET = async (req: NextRequest) => {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker 파라미터가 필요합니다" }, { status: 400 });
  }
  // market 미지정은 세션 결정 경로(regular=J, 그 외=NX)로 흐른다 — 하위호환.
  const market = parseMarket(req.nextUrl.searchParams.get("market"));

  // 세션/거래일은 순수 KST 시계 함수 — KIS 응답 무관. try 밖에서 계산해
  // catch 경로에서도 그대로 재사용 (초기 로드 스켈레톤 게이트 해소용).
  const session = getKrxSessionState();
  // 폴링 게이트: 활성 세션(regular/after/pre)만 true. after_close는 1회 호출 후 정지.
  const marketOpen =
    session === "regular" || session === "after" || session === "pre";
  const date = getKrxTradingDate();

  try {
    // KRX 탭: 정규장 J 호출만 유효. 그 외 세션엔 KRX 라이브가 없어 quote:null 로 흘리고
    // 클라가 SSR EOD 값을 그대로 표시한다.
    if (market === "krx") {
      let quote: StockQuote | null = null;
      if (session === "regular") {
        quote = await fetchStockQuote(ticker, "J");
      }
      const failed = session === "regular" && quote === null;
      return NextResponse.json({ quote, marketOpen, session, date, failed });
    }

    // 오프아워(after_close/closed/preopen) 는 quote_snapshots 서빙 우선.
    // 캡처 실패(date 통째로 없음) 시 KIS 경로로 fallback.
    // 부분 miss (해당 티커만 없음) 는 quote:null 로 서빙 — 클라의 isNxtMiss 판정이
    // live===null 경로에 의존하므로 UI 무변경. market=nxt 도 이 경로 공유
    // (스냅샷 un/nx 컬럼이 실측 완전일치).
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

    // NXT 탭(market=nxt) — 활성 세션(regular/pre/after) 모두 NX 채널.
    // market 미지정(기본 경로) — 세션별 J/NX 토글 (regular=J, 확장 세션=NX).
    // isNxtMiss 판정은 after/after_close/pre/closed 에서 NX 응답이 null(비NXT 종목 iscd=null →
    // normalizeStockQuote=null)인 경로에 의존. UN 통합으로 바꾸면 KRX 값이 흘러가 라벨이
    // "장 마감" 대신 "애프터마켓" 으로 회귀하므로 유지. closed(주말·공휴일) NX 요청은 KIS 가
    // 직전 NXT 세션 종가(20:00)를 반환하는 특성에 의존.
    let quote: StockQuote | null = null;
    if (market === "nxt") {
      if (session === "regular" || session === "after" || session === "pre") {
        quote = await fetchStockQuote(ticker, "NX");
      }
      // 오프아워는 위 스냅샷 경로에서 이미 처리 — fallback 시 quote=null 유지.
    } else if (session === "regular") {
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
    // market=nxt regular 는 비NXT 종목이 NX 채널에서 null 인 게 정상이라 실패로 안 잡음.
    const failed = market !== "nxt" && session === "regular" && quote === null;
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
