import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";
import {
  isStaleIntradayResponse,
  scheduleStaleRefetch,
} from "./staleIntradayRefetch";

export type IndexIntradayResponse = {
  quotes: Record<DomesticIndexCode, IndexIntradaySnapshot[]>;
  marketOpen: boolean;
  // route 가 완전 fetch 실패 시 해당 지수 true. bars 는 항상 [] 로 정규화되므로
  // 실패↔정상 empty(preopen/휴장) 를 client 에서 구분하는 유일한 신호.
  failed: Record<DomesticIndexCode, boolean>;
  // 정규장 셀 중 가장 오래된 서버 조립 시각 (epoch ms). 정규장 밖·전체 실패는 null.
  fetchedAt: number | null;
};

// route regular TTL(60s) 과 정렬된 값 — stale 응답 판정의 TTL 로도 겸한다.
const POLL_INTERVAL_MS = 60_000;
// closed 에서도 느린 cadence 유지 — 개장 전 로드된 held 탭이 09:00 을 감지해
// marketOpen=true 수신 시 regular cadence 로 자동 승격. 서버 세션 캐시 히트라 KIS 콜 0.
const CLOSED_POLL_MS = 120_000;

// 국내 지수 인트라데이를 단일 폴링으로 가져온다.
// 직전 응답 marketOpen=true 일 때 60s, 그 외 120s 로 2단 cadence.
//
// stale 재조회 — 응답 fetchedAt 이 TTL + 여유를 넘기면 3s 뒤 1회 refetch. 응답당 최대 1회:
// 예약이 실제로 나갔으면 그 결과 응답은 재검증 미완료로 또 stale 이어도 판정하지 않는다
// (체이닝 차단). 다음 tick 응답부터 다시 판정.
export const useIndexIntraday = () => {
  const query = useQuery<IndexIntradayResponse>({
    queryKey: ["index-intraday"],
    queryFn: async () => {
      const res = await fetch("/api/index-intraday");
      if (!res.ok) throw new Error("index intraday fetch failed");
      return res.json();
    },
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
      // cancelRefetch:false — 관측자 여럿(슬레이트·차트)이 같은 응답에 각자 예약해도
      // 진행 중 fetch 에 합류해 route 호출 1회로 접힌다.
      void refetch({ cancelRefetch: false });
    });
  }, [fetchedAt, dataUpdatedAt, refetch]);
  return query;
};
