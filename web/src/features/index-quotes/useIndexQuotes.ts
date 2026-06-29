import { useQuery } from "@tanstack/react-query";
import type { IndexDailySnapshot, IndexQuote } from "@/shared/types/quote";

export type IndexCellData = {
  live: IndexQuote | null;
  fallback: IndexDailySnapshot | null;
};

export type IndexQuotesResponse = {
  quotes: {
    kospi: IndexCellData;
    kosdaq: IndexCellData;
    kospi200: IndexCellData;
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
