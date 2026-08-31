import { useQuery } from "@tanstack/react-query";
import type { DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export type IndexIntradayResponse = {
  quotes: Record<DomesticIndexCode, IndexIntradaySnapshot[]>;
  marketOpen: boolean;
  // route 가 완전 fetch 실패 시 해당 지수 true. bars 는 항상 [] 로 정규화되므로
  // 실패↔정상 empty(preopen/휴장) 를 client 에서 구분하는 유일한 신호.
  failed: Record<DomesticIndexCode, boolean>;
};

const POLL_INTERVAL_MS = 60_000;
// closed 에서도 느린 cadence 유지 — 개장 전 로드된 held 탭이 09:00 을 감지해
// marketOpen=true 수신 시 regular cadence 로 자동 승격. 서버 세션 캐시 히트라 KIS 콜 0.
const CLOSED_POLL_MS = 120_000;

// 국내 지수 인트라데이를 단일 폴링으로 가져온다.
// 직전 응답 marketOpen=true 일 때 60s, 그 외 120s 로 2단 cadence.
export const useIndexIntraday = () =>
  useQuery<IndexIntradayResponse>({
    queryKey: ["index-intraday"],
    queryFn: async () => {
      const res = await fetch("/api/index-intraday");
      if (!res.ok) throw new Error("index intraday fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : CLOSED_POLL_MS,
  });
