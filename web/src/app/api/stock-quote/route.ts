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
    // UN(KRX+NXT 통합) 단일 호출. 이전엔 세션별 J/NX 토글이 있었으나 KIS 실측 결과
    // UN 이 통합 vol/OHL 을 반환하며(J vol + NX vol ≈ UN vol), NXT 미상장 종목의
    // NX 응답(값 전부 0)으로 인한 today-bar 폭락 버그를 피할 수 있음.
    // preopen/closed 는 KIS 호출 스킵 유지 — 시세 없는 시간대에 낭비되는 요청 회피.
    let quote: StockQuote | null = null;
    if (
      session === "regular" ||
      session === "after" ||
      session === "after_close" ||
      session === "pre"
    ) {
      quote = await fetchStockQuote(ticker);
    }

    // 정규장 중 KIS 가 throw 없이 null 만 돌려준 경우만 실패로 취급 — 09:00~15:30 에는
    // KRX 상장 종목이면 응답이 있어야 정상. 그 외 세션은 실패/정상-빈응답이 구분 불가라
    // 클라이언트가 세션 라벨 유지한 채 자연 처리하도록 failed=false.
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
