import { useQuery } from "@tanstack/react-query";
import type { OverseasIndexCode } from "@/shared/constants/indices";
import type { IndexQuote } from "@/shared/types/quote";
import { useStaleRefetch } from "@/shared/hooks/useStaleRefetch";

export type OverseasIndexQuotesResponse = {
  quotes: Record<OverseasIndexCode, IndexQuote | null>;
  // KST 05:00~09:00 은 idle (전 세계 주요 시장 공통 휴지 구간). 클라 폴링 게이트.
  active: boolean;
  date: string; // KST 캘린더 일자 'YYYY-MM-DD'
  // active 셀 중 가장 오래된 서버 조립 시각 (epoch ms). idle·전체 실패는 null.
  fetchedAt: number | null;
};

// route active TTL(60s) 과 정렬된 값 — stale 응답 판정의 TTL 로도 겸한다.
const POLL_INTERVAL_MS = 60_000;
// idle(KST 05:00~09:00) 에서도 느린 cadence 유지 — active 판정이 서버 응답 필드라
// 클라가 09:00 승격을 자가 감지 못하므로 폴링 필요. 서버 세션 캐시 히트라 생성기 재계산 없음.
const CLOSED_POLL_MS = 120_000;

// useIndexQuotes 와 동일 패턴. active=true 60s / 그 외 120s 2단 cadence.
export const useOverseasIndexQuotes = () => {
  const query = useQuery<OverseasIndexQuotesResponse>({
    queryKey: ["overseas-index-quotes"],
    queryFn: async () => {
      const res = await fetch("/api/overseas-index-quotes");
      if (!res.ok) throw new Error("overseas index quotes fetch failed");
      return res.json();
    },
    refetchInterval: (query) => (query.state.data?.active ? POLL_INTERVAL_MS : CLOSED_POLL_MS),
  });
  useStaleRefetch({
    fetchedAt: query.data?.fetchedAt ?? null,
    dataUpdatedAt: query.dataUpdatedAt,
    ttlMs: POLL_INTERVAL_MS,
    refetch: query.refetch,
  });
  return query;
};
