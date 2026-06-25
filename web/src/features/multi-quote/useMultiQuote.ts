import { useQuery } from "@tanstack/react-query";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

export type MultiQuoteResponse = {
  quotes: Record<string, StockQuote | null>;
  marketOpen: boolean;
  session: KrxSession;
};

const POLL_INTERVAL_MS = 60_000;

// 정렬+중복제거된 join 키. 순서·중복 무관하게 동일 queryKey가 되도록.
const buildKey = (tickers: string[]): string =>
  [...new Set(tickers)].sort().join(",");

type UseMultiQuoteResult = {
  quotes: Record<string, StockQuote | null>;
  marketOpen: boolean;
  session: KrxSession | undefined;
  isLoading: boolean;
};

// 직전 응답의 marketOpen=true일 때만 60초 주기 폴링. 폐장 시 정지.
export const useMultiQuote = (tickers: string[]): UseMultiQuoteResult => {
  const key = buildKey(tickers);

  const query = useQuery<MultiQuoteResponse>({
    queryKey: ["multi-quote", key],
    queryFn: async () => {
      const res = await fetch(`/api/multi-quote?tickers=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error("multi quote fetch failed");
      return res.json();
    },
    enabled: tickers.length > 0,
    refetchInterval: (q) => (q.state.data?.marketOpen ? POLL_INTERVAL_MS : false),
  });

  return {
    quotes: query.data?.quotes ?? {},
    marketOpen: query.data?.marketOpen ?? false,
    session: query.data?.session,
    isLoading: query.isLoading,
  };
};
