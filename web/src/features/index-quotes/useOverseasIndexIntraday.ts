import { useQuery } from "@tanstack/react-query";
import type { OverseasIntradayCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export type OverseasIndexIntradayResponse = {
  quotes: Record<OverseasIntradayCode, IndexIntradaySnapshot[]>;
  marketOpen: boolean; // US 정규장 여부. 폴링 게이트.
  // route 완전 fetch 실패 시 해당 코드 true. bars 는 항상 [] 이므로 실패↔정상 empty 구분.
  failed: Record<OverseasIntradayCode, boolean>;
};

// 국내 60s 보다 완만 — 라이브 자체가 ~15분 지연 피드라 짧은 폴링 이득 없음.
const POLL_INTERVAL_MS = 120_000;

// US 정규장 중에만 폴링. 국내 훅과 분리 유지 (국내 마감 후에도 US 폴링 지속 필요).
export const useOverseasIndexIntraday = () =>
  useQuery<OverseasIndexIntradayResponse>({
    queryKey: ["overseas-index-intraday"],
    queryFn: async () => {
      const res = await fetch("/api/overseas-index-intraday");
      if (!res.ok) throw new Error("overseas index intraday fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });
