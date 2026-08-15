import { useQuery } from "@tanstack/react-query";
import type { OverseasIndexCode } from "@/shared/constants/indices";
import type { IndexQuote } from "@/shared/types/quote";

export type OverseasIndexQuotesResponse = {
  quotes: Record<OverseasIndexCode, IndexQuote | null>;
  // KST 05:00~09:00 은 idle (전 세계 주요 시장 공통 휴지 구간). 클라 폴링 게이트.
  active: boolean;
  date: string; // KST 캘린더 일자 'YYYY-MM-DD'
};

const POLL_INTERVAL_MS = 60_000;

// useIndexQuotes 와 동일 패턴. active=false 이면 폴링 정지.
export const useOverseasIndexQuotes = () =>
  useQuery<OverseasIndexQuotesResponse>({
    queryKey: ["overseas-index-quotes"],
    queryFn: async () => {
      const res = await fetch("/api/overseas-index-quotes");
      if (!res.ok) throw new Error("overseas index quotes fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.active ? POLL_INTERVAL_MS : false,
  });
