import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";
import { getKrxSessionState } from "@/shared/utils/market";

export type StockQuoteResponse = {
  quote: StockQuote | null;
  marketOpen: boolean;
  session: KrxSession;
};

const POLL_INTERVAL_MS = 60_000;

const isActiveSession = () => {
  const s = getKrxSessionState();
  return s === "regular" || s === "after" || s === "pre";
};

// 클라이언트 시계 기준 60초 폴링. 서버 응답의 marketOpen 에 의존하지 않으므로
// preopen → regular 같은 세션 전환 시에도 페이지 새로고침 없이 자동 재개된다.
export const useStockQuote = (ticker: string) => {
  const query = useQuery<StockQuoteResponse>({
    queryKey: ["stock-quote", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock-quote?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) throw new Error("stock quote fetch failed");
      return res.json();
    },
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (isActiveSession()) void query.refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
};
