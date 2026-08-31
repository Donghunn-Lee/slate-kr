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
// idle(KST 05:00~09:00) 에서도 느린 cadence 유지 — active 판정이 서버 응답 필드라
// 클라가 09:00 승격을 자가 감지 못하므로 폴링 필요. 서버 세션 캐시 히트라 KIS 콜 0.
const CLOSED_POLL_MS = 120_000;

// useIndexQuotes 와 동일 패턴. active=true 60s / 그 외 120s 2단 cadence.
export const useOverseasIndexQuotes = () =>
  useQuery<OverseasIndexQuotesResponse>({
    queryKey: ["overseas-index-quotes"],
    queryFn: async () => {
      const res = await fetch("/api/overseas-index-quotes");
      if (!res.ok) throw new Error("overseas index quotes fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.active ? POLL_INTERVAL_MS : CLOSED_POLL_MS,
  });
