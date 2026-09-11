import { useEffect, useState } from "react";
import { focusManager, useQuery } from "@tanstack/react-query";
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
// 국내 2훅(index-quotes·index-intraday) 과 같은 초에 첫 fetch 가 나가지 않도록 두는 간격.
// 4 route 가 한 초에 miss 하면 KIS 콜이 최대 23 (앱키 한도 20/s) — 국내 8 / 해외 15 로
// 초를 가른다. 탭 복귀에도 같은 간격을 둔다: TanStack 포커스 refetch 는 stale 쿼리를
// 한 tick 에 몰아 쏘므로 첫 틱과 같은 정렬이 재발한다. 폴링 주기·TTL 은 그대로.
const FIRST_FETCH_OFFSET_MS = 2_000;

// useIndexQuotes 와 동일 패턴. active=true 60s / 그 외 120s 2단 cadence.
export const useOverseasIndexQuotes = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setReady(true), FIRST_FETCH_OFFSET_MS);
    };
    arm();
    // hidden 에서 enabled 를 내려 두어야 복귀 순간의 포커스 refetch 가 이 쿼리를 건너뛰고,
    // 간격 뒤 enabled 복귀가 (stale 이면) refetch 를 대신한다.
    const unsubscribe = focusManager.subscribe((focused) => {
      if (focused) {
        arm();
        return;
      }
      clearTimeout(timer);
      setReady(false);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return useQuery<OverseasIndexQuotesResponse>({
    queryKey: ["overseas-index-quotes"],
    queryFn: async () => {
      const res = await fetch("/api/overseas-index-quotes");
      if (!res.ok) throw new Error("overseas index quotes fetch failed");
      return res.json();
    },
    enabled: ready,
    refetchInterval: (query) =>
      query.state.data?.active ? POLL_INTERVAL_MS : CLOSED_POLL_MS,
  });
};
