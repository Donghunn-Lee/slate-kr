import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";
import { getKrxSessionState, isKrxActiveSession } from "@/shared/utils/market";

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
};

const POLL_INTERVAL_MS = 60_000;

// market.ts 의 isKrxActiveSession 을 클라 시계에 얹은 얇은 어댑터.
// useStockIntraday(서버 응답 session 을 인자로 넘김)와 동일 술어를 공유.
const isActiveSession = () => isKrxActiveSession(getKrxSessionState());

// 클라이언트 시계 기준 60초 폴링. 서버 응답의 marketOpen 에 의존하지 않으므로
// preopen → regular 같은 세션 전환 시에도 페이지 새로고침 없이 자동 재개된다.
// subscribeOnly=true 면 폴링 없이 기존 queryKey 캐시만 구독한다 (동일 티커의 헤더 폴링을 재사용).
export const useStockQuote = (
  ticker: string,
  options: UseStockQuoteOptions = {},
) => {
  const { subscribeOnly = false } = options;

  const query = useQuery<StockQuoteResponse>({
    queryKey: ["stock-quote", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock-quote?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) throw new Error("stock quote fetch failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (subscribeOnly) return;
    const id = setInterval(() => {
      if (isActiveSession()) void query.refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ticker, subscribeOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
};
