import { useEffect } from "react";
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
  subscribeOnly?: boolean;
  // 명시 시장 축. undefined 는 세션 결정 경로. queryKey 에 포함되어 축이 다른 폴링을
  // 별도 캐시로 분리한다.
  market?: QuoteMarket;
  // false 로 두면 fetch·폴링 모두 중단 (응답이 항상 null 로 확정된 경우 낭비 방지).
  enabled?: boolean;
  // 확정 종가 date. 값이 바뀌면 queryKey 가 갱신되어 새 캐시 슬롯에서 초기 fetch 1회 발생.
  // undefined 는 queryKey 미포함 — 다른 호출처 캐시 키와 정합 유지.
  closeDate?: string;
};

const POLL_INTERVAL_MS = 60_000;

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
  // market undefined 는 "auto" sentinel 로 캐시 키 안정화 (미지정 경로가 지정 경로와 섞이지 않게).
  const marketKey: QuoteMarket | "auto" = market ?? "auto";

  const query = useQuery<StockQuoteResponse>({
    queryKey: closeDate
      ? ["stock-quote", ticker, marketKey, closeDate]
      : ["stock-quote", ticker, marketKey],
    queryFn: async () => {
      const params = new URLSearchParams({ ticker });
      if (market) params.set("market", market);
      const res = await fetch(`/api/stock-quote?${params.toString()}`);
      if (!res.ok) throw new Error("stock quote fetch failed");
      return res.json();
    },
    enabled,
  });

  useEffect(() => {
    if (subscribeOnly || !enabled) return;
    const id = setInterval(() => {
      if (isActiveSession(calendar)) void query.refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ticker, subscribeOnly, enabled, marketKey, calendar]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
};
