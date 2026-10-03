import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockQuote } from "@/shared/types/quote";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import type { KrxSession, QuoteMarket } from "@/shared/utils/market";
import { getKrxSessionState, isKrxActiveSession } from "@/shared/utils/market";
import { useMarketCalendar } from "@/shared/contexts/MarketCalendarContext";

export type StockQuoteResponse = {
  quote: StockQuote | null;
  marketOpen: boolean;
  session: KrxSession;
  date: string; // KST 거래일 'YYYY-MM-DD' (당일 봉 병합용)
  // route catch 진입 시 true. quote:null 이 정상 empty(NXT 미지원 등) 인지 실패인지
  // 구분하는 신호. StockHeaderLivePrice 가 세션 라벨 유지 + "일시 지연" 배지 판정에 사용.
  failed: boolean;
};

type UseStockQuoteOptions = {
  /** true 면 setInterval 폴링만 정지. useQuery 는 그대로라 캐시가 없거나 stale 이면 초기 fetch 는 발생한다. */
  subscribeOnly?: boolean;
  // 명시 시장 축. undefined 는 세션 결정 경로. queryKey 에 포함되어 축이 다른 폴링을
  // 별도 캐시로 분리한다.
  market?: QuoteMarket;
  // false 로 두면 fetch·폴링 모두 중단 (응답이 항상 null 로 확정된 경우 낭비 방지).
  enabled?: boolean;
  // 확정 종가 date. 값이 바뀌면 같은 캐시 항목을 1회 refetch — queryKey 에는 넣지 않아
  // 차트 구독(closeDate 미지정)과 항목을 공유한다.
  closeDate?: string;
};

const POLL_INTERVAL_MS = 60_000;

// 헤더 폴링과 차트 구독이 같은 캐시 항목을 보도록 키 조립은 이 함수 한 곳에서만 한다.
// market undefined 는 "auto" sentinel 로 캐시 키 안정화 (미지정 경로가 지정 경로와 섞이지 않게).
export const stockQuoteQueryKey = (ticker: string, market?: QuoteMarket) =>
  ["stock-quote", ticker, market ?? "auto"] as const;

// market.ts 의 isKrxActiveSession 을 클라 시계에 얹은 얇은 어댑터.
// useStockIntraday(서버 응답 session 을 인자로 넘김)와 동일 술어를 공유.
const isActiveSession = (calendar?: MarketCalendar) =>
  isKrxActiveSession(getKrxSessionState(new Date(), calendar));

// 클라이언트 시계 기준 60초 폴링. 서버 응답의 marketOpen 에 의존하지 않으므로
// preopen → regular 같은 세션 전환 시에도 페이지 새로고침 없이 자동 재개된다.
// subscribeOnly=true 면 폴링 없이 기존 queryKey 캐시만 구독한다 (동일 티커의 헤더 폴링을 재사용).
export const useStockQuote = (
  ticker: string,
  options: UseStockQuoteOptions = {},
) => {
  const { subscribeOnly = false, market, enabled = true, closeDate } = options;
  const calendar = useMarketCalendar();
  const marketKey: QuoteMarket | "auto" = market ?? "auto";

  const query = useQuery<StockQuoteResponse>({
    queryKey: stockQuoteQueryKey(ticker, market),
    queryFn: async () => {
      const params = new URLSearchParams({ ticker });
      if (market) params.set("market", market);
      const res = await fetch(`/api/stock-quote?${params.toString()}`);
      if (!res.ok) throw new Error("stock quote fetch failed");
      return res.json();
    },
    enabled,
  });

  // query 는 렌더마다 새 객체라 dep 에 넣으면 매 렌더 interval 이 재설정된다 — 의도적으로 제외.
  useEffect(() => {
    if (subscribeOnly || !enabled) return;
    const id = setInterval(() => {
      if (isActiveSession(calendar)) void query.refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ticker, subscribeOnly, enabled, marketKey, calendar]); // eslint-disable-line react-hooks/exhaustive-deps

  // 날짜 → 날짜 변화만 본다. 시장 탭 전환(undefined ↔ 날짜)은 키 자체가 바뀌어 useQuery 가 처리한다.
  const { refetch } = query;
  const prevCloseDate = useRef(closeDate);
  useEffect(() => {
    const prev = prevCloseDate.current;
    prevCloseDate.current = closeDate;
    if (!enabled || prev === undefined || closeDate === undefined || prev === closeDate) return;
    void refetch();
  }, [closeDate, enabled, refetch]);

  return query;
};
