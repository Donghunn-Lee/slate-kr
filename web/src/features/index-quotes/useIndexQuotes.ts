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
// closed 에서도 느린 cadence 유지 — 개장 전 로드된 held 탭이 09:00 을 감지해
// marketOpen=true 수신 시 regular cadence 로 자동 승격. 서버 세션 캐시 히트라 KIS 콜 0.
const CLOSED_POLL_MS = 120_000;

// 직전 응답 marketOpen=true 일 때 60s, 그 외 120s 로 2단 cadence.
export const useIndexQuotes = () =>
  useQuery<IndexQuotesResponse>({
    queryKey: ["index-quotes"],
    queryFn: async () => {
      const res = await fetch("/api/index-quotes");
      if (!res.ok) throw new Error("index quotes fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : CLOSED_POLL_MS,
  });
