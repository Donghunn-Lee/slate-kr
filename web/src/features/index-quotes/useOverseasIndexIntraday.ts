import { useQuery } from "@tanstack/react-query";
import type { OverseasIntradayCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";
import { useStaleRefetch } from "@/shared/hooks/useStaleRefetch";

export type OverseasIndexIntradayResponse = {
  quotes: Record<OverseasIntradayCode, IndexIntradaySnapshot[]>;
  marketOpen: boolean; // US 정규장 여부. 폴링 게이트.
  // route 완전 fetch 실패 시 해당 코드 true. bars 는 항상 [] 이므로 실패↔정상 empty 구분.
  failed: Record<OverseasIntradayCode, boolean>;
  // 정규장 코드 셀 중 가장 오래된 서버 조립 시각 (epoch ms). 정규장 코드 없음·전체 실패는 null.
  fetchedAt: number | null;
};

// 국내 60s 보다 완만 — 라이브 자체가 ~15분 지연 피드라 짧은 폴링 이득 없음.
// route regular TTL(120s) 과 정렬된 값 — stale 응답 판정의 TTL 로도 겸한다.
const POLL_INTERVAL_MS = 120_000;
// closed 에서도 느린 cadence 유지 — 개장 전 로드된 held 탭이 세션 개장을 감지해
// marketOpen=true 수신 시 regular cadence 로 자동 승격. 서버 세션 캐시 히트라 생성기 재계산 없음.
const CLOSED_POLL_MS = 240_000;

// 어느 해외 지수든 정규장이 열려 있으면 regular 폴링 (route 의 aggregate marketOpen).
// 국내 훅과 분리 유지 — 국내 마감 후에도 해외 폴링 지속 필요.
export const useOverseasIndexIntraday = () => {
  const query = useQuery<OverseasIndexIntradayResponse>({
    queryKey: ["overseas-index-intraday"],
    queryFn: async () => {
      const res = await fetch("/api/overseas-index-intraday");
      if (!res.ok) throw new Error("overseas index intraday fetch failed");
      return res.json();
    },
    refetchInterval: (query) => (query.state.data?.marketOpen ? POLL_INTERVAL_MS : CLOSED_POLL_MS),
  });
  useStaleRefetch({
    fetchedAt: query.data?.fetchedAt ?? null,
    dataUpdatedAt: query.dataUpdatedAt,
    ttlMs: POLL_INTERVAL_MS,
    refetch: query.refetch,
  });
  return query;
};
