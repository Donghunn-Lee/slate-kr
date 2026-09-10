// 지수 인트라데이 route 는 unstable_cache SWR — TTL 만료 후 첫 요청은 stale 엔트리를 받고
// 재검증만 트리거한다. 탭 복귀·저트래픽 첫 로드가 그 첫 요청이 되면 hidden 기간만큼 오래된
// 봉이 다음 tick 까지 남으므로, 조립 시각(fetchedAt) 이 TTL + 여유를 넘긴 응답은 짧은 지연
// 뒤 1회 재조회한다. 재검증(KIS ~0.5s) 이 끝난 캐시를 히트하므로 KIS 콜은 0.
export const STALE_REFETCH_DELAY_MS = 3_000;
// TTL 위 여유. 폴링과 TTL 이 정렬돼 있어 정상 tick 도 경계를 폴링 지터(수 초)만큼 넘긴
// 엔트리를 받는데, 그건 cadence 가 약속한 신선도 그대로라 재조회 대상이 아니다.
// 15s 는 지터를 덮으면서 hidden 90s 이상은 잡는 폭.
export const STALE_TOLERANCE_MS = 15_000;

// fetchedAt null = route 가 판정 대상이 아니라고 알린 응답(정규장 셀 없음·전체 실패).
export const isStaleIntradayResponse = (
  fetchedAt: number | null,
  ttlMs: number,
  now: number = Date.now(),
): boolean => fetchedAt !== null && now - fetchedAt > ttlMs + STALE_TOLERANCE_MS;

// 예약 1건. 반환 cleanup 이 언마운트·응답 교체에서 예약을 걷어낸다. hidden 탭은 발화 시점에
// 버린다 — 폴링 interval 이 hidden 탭을 건너뛰는 것과 같은 축.
export const scheduleStaleRefetch = (refetch: () => void): (() => void) => {
  const id = setTimeout(() => {
    if (document.hidden) return;
    refetch();
  }, STALE_REFETCH_DELAY_MS);
  return () => clearTimeout(id);
};
