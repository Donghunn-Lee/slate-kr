import { useQuery } from "@tanstack/react-query";
import type { DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot, IndexQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

export type IndexCellData = {
  live: IndexQuote | null;
  fallback: IndexDailySnapshot | null;
};

export type IndexQuotesResponse = {
  quotes: Record<DomesticIndexCode, IndexCellData>;
  marketOpen: boolean;
  // 서버 KST 세션. IndexChart 의 pre/preopen day-bar merge 게이트에 사용
  // (useStockQuote 응답 session 과 동형).
  session: KrxSession;
  date: string; // KST 거래일 'YYYY-MM-DD' (당일 봉 병합용)
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
