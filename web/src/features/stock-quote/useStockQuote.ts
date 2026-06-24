import { useQuery } from "@tanstack/react-query";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

export type StockQuoteResponse = {
  quote: StockQuote | null;
  marketOpen: boolean;
  session: KrxSession;
};

const POLL_INTERVAL_MS = 60_000;

// 직전 응답의 marketOpen=true일 때만 60초 주기 폴링. 폐장 시 정지.
export const useStockQuote = (ticker: string) =>
  useQuery<StockQuoteResponse>({
    queryKey: ["stock-quote", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock-quote?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) throw new Error("stock quote fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });
