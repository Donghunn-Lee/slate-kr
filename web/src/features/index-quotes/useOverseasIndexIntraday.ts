import { useEffect, useRef, useState } from "react";
import { focusManager, useQuery } from "@tanstack/react-query";
import type { OverseasIntradayCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";
import {
  isStaleIntradayResponse,
  scheduleStaleRefetch,
} from "./staleIntradayRefetch";

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
// marketOpen=true 수신 시 regular cadence 로 자동 승격. 서버 세션 캐시 히트라 KIS 콜 0.
const CLOSED_POLL_MS = 240_000;
// 국내 2훅(index-quotes·index-intraday) 과 같은 초에 첫 fetch 가 나가지 않도록 두는 간격.
// 4 route 가 한 초에 miss 하면 KIS 콜이 최대 23 (앱키 한도 20/s) — 국내 8 / 해외 15 로
// 초를 가른다. 탭 복귀에도 같은 간격을 둔다: TanStack 포커스 refetch 는 stale 쿼리를
// 한 tick 에 몰아 쏘므로 첫 틱과 같은 정렬이 재발한다. 폴링 주기·TTL 은 그대로.
const FIRST_FETCH_OFFSET_MS = 2_000;

// 어느 해외 지수든 정규장이 열려 있으면 regular 폴링 (route 의 aggregate marketOpen).
// 국내 훅과 분리 유지 — 국내 마감 후에도 해외 폴링 지속 필요.
//
// stale 재조회 — 응답 fetchedAt 이 TTL + 여유를 넘기면 3s 뒤 1회 refetch. 응답당 최대 1회:
// 예약이 실제로 나갔으면 그 결과 응답은 재검증 미완료로 또 stale 이어도 판정하지 않는다
// (체이닝 차단). 다음 tick 응답부터 다시 판정.
export const useOverseasIndexIntraday = () => {
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

  const query = useQuery<OverseasIndexIntradayResponse>({
    queryKey: ["overseas-index-intraday"],
    queryFn: async () => {
      const res = await fetch("/api/overseas-index-intraday");
      if (!res.ok) throw new Error("overseas index intraday fetch failed");
      return res.json();
    },
    enabled: ready,
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : CLOSED_POLL_MS,
  });
  const { dataUpdatedAt, refetch } = query;
  const fetchedAt = query.data?.fetchedAt ?? null;
  const retriedRef = useRef(false);
  // dataUpdatedAt 축 — 같은 stale 엔트리를 다시 받으면 structural sharing 으로 data 참조가
  // 유지되므로 fetchedAt 만으로는 응답 교체를 감지하지 못한다.
  useEffect(() => {
    if (retriedRef.current) {
      retriedRef.current = false;
      return;
    }
    if (!isStaleIntradayResponse(fetchedAt, POLL_INTERVAL_MS)) return;
    return scheduleStaleRefetch(() => {
      retriedRef.current = true;
      // cancelRefetch:false — 관측자 여럿(레일·칩·상세·차트)이 같은 응답에 각자 예약해도
      // 진행 중 fetch 에 합류해 route 호출 1회로 접힌다.
      void refetch({ cancelRefetch: false });
    });
  }, [fetchedAt, dataUpdatedAt, refetch]);
  return query;
};
