import { useQuery } from "@tanstack/react-query";
import type { IndexQuote } from "@/shared/types/quote";

export type IndexQuotesResponse = {
  quotes: {
    kospi: IndexQuote | null;
    kosdaq: IndexQuote | null;
    kospi200: IndexQuote | null;
  };
  marketOpen: boolean;
};

const POLL_INTERVAL_MS = 60_000;

// 직전 응답의 marketOpen=true일 때만 60초 주기 폴링. 장 마감 시 정지.
export const useIndexQuotes = () =>
  useQuery<IndexQuotesResponse>({
    queryKey: ["index-quotes"],
    queryFn: async () => {
      const res = await fetch("/api/index-quotes");
      if (!res.ok) throw new Error("index quotes fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });
