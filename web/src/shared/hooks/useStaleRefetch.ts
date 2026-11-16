import { useEffect, useRef } from "react";
import type { RefetchOptions } from "@tanstack/react-query";
import { decideStaleRefetch, scheduleStaleRefetch } from "@/shared/utils/staleRefetch";

type UseStaleRefetchParams = {
  // 응답의 서버 조립 시각 (epoch ms). null 이면 판정하지 않는다.
  fetchedAt: number | null;
  dataUpdatedAt: number;
  ttlMs: number;
  refetch: (options?: RefetchOptions) => Promise<unknown>;
};

// stale 재조회 — 응답 fetchedAt 이 TTL + 여유를 넘기면 3s 뒤 1회 refetch. 응답당 최대 1회:
// 예약이 실제로 나갔으면 그 결과 응답은 재검증 미완료로 또 stale 이어도 판정하지 않는다
// (체이닝 차단). 다음 tick 응답부터 다시 판정.
export const useStaleRefetch = ({
  fetchedAt,
  dataUpdatedAt,
  ttlMs,
  refetch,
}: UseStaleRefetchParams): void => {
  const retriedRef = useRef(false);
  // dataUpdatedAt 축 — 같은 stale 엔트리를 다시 받으면 structural sharing 으로 data 참조가
  // 유지되므로 fetchedAt 만으로는 응답 교체를 감지하지 못한다.
  useEffect(() => {
    const decision = decideStaleRefetch(retriedRef.current, fetchedAt, ttlMs);
    retriedRef.current = decision.retried;
    if (!decision.schedule) return;
    return scheduleStaleRefetch(() => {
      retriedRef.current = true;
      // cancelRefetch:false — 관측자 여럿이 같은 응답에 각자 예약해도 진행 중 fetch 에
      // 합류해 route 호출 1회로 접힌다.
      void refetch({ cancelRefetch: false });
    });
  }, [fetchedAt, dataUpdatedAt, ttlMs, refetch]);
};
