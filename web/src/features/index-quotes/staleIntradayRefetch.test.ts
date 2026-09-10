import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStaleIntradayResponse,
  scheduleStaleRefetch,
  STALE_REFETCH_DELAY_MS,
  STALE_TOLERANCE_MS,
} from "./staleIntradayRefetch";

const NOW = 1_789_015_175_778;
const KRX_TTL = 60_000;
const OVERSEAS_TTL = 120_000;

describe("isStaleIntradayResponse — 응답 fetchedAt 나이 vs TTL + 여유", () => {
  it("fetchedAt null (정규장 밖·전체 실패) → false", () => {
    expect(isStaleIntradayResponse(null, KRX_TTL, NOW)).toBe(false);
  });
  it("나이 3.2s (재검증 직후 캐시 히트) → false", () => {
    expect(isStaleIntradayResponse(NOW - 3_200, KRX_TTL, NOW)).toBe(false);
  });
  // 정상 tick 실측값 — 폴링 지터로 TTL 을 살짝 넘긴 엔트리는 cadence 가 약속한 신선도.
  it("정상 tick — 나이 64.6s → false", () => {
    expect(isStaleIntradayResponse(NOW - 64_600, KRX_TTL, NOW)).toBe(false);
  });
  it("나이 == TTL + 여유 → false", () => {
    expect(
      isStaleIntradayResponse(NOW - KRX_TTL - STALE_TOLERANCE_MS, KRX_TTL, NOW),
    ).toBe(false);
  });
  it("나이 TTL + 여유 + 1ms → true", () => {
    expect(
      isStaleIntradayResponse(NOW - KRX_TTL - STALE_TOLERANCE_MS - 1, KRX_TTL, NOW),
    ).toBe(true);
  });
  it("hidden 90s → true", () => {
    expect(isStaleIntradayResponse(NOW - 90_000, KRX_TTL, NOW)).toBe(true);
  });
  it("탭 복귀 — 나이 3분 → true", () => {
    expect(isStaleIntradayResponse(NOW - 180_000, KRX_TTL, NOW)).toBe(true);
  });
  it("해외 TTL 120s — 나이 130s 는 정상 tick, 150s 는 stale", () => {
    expect(isStaleIntradayResponse(NOW - 130_000, OVERSEAS_TTL, NOW)).toBe(false);
    expect(isStaleIntradayResponse(NOW - 150_000, OVERSEAS_TTL, NOW)).toBe(true);
  });
});

// 훅 effect 의 응답 1건당 판정 조립식. 훅은 vitest node 환경에서 렌더할 수 없으므로
// useStockIntraday.test.ts 관례대로 테스트에 복제해 고정한다.
// retried = 직전 예약이 실제로 나갔는지. 그 결과 응답은 stale 이어도 판정하지 않는다.
type GuardState = { retried: boolean };
const step = (
  state: GuardState,
  fetchedAt: number | null,
  now: number,
): { scheduled: boolean; state: GuardState } => {
  if (state.retried) return { scheduled: false, state: { retried: false } };
  if (!isStaleIntradayResponse(fetchedAt, KRX_TTL, now)) {
    return { scheduled: false, state };
  }
  return { scheduled: true, state };
};
const fired = (state: GuardState): GuardState => ({ ...state, retried: true });

describe("stale 재조회 가드 — 응답당 최대 1회, 체이닝 금지", () => {
  const STALE_AT = NOW - 180_000;

  it("stale 응답 → 예약, 예약이 나간 뒤 받은 응답이 또 stale 이어도 재예약 없음", () => {
    let s: GuardState = { retried: false };
    const first = step(s, STALE_AT, NOW);
    expect(first.scheduled).toBe(true);
    s = fired(first.state);
    // 재검증 미완료 — 같은 stale 엔트리를 다시 받음
    const second = step(s, STALE_AT, NOW + STALE_REFETCH_DELAY_MS);
    expect(second.scheduled).toBe(false);
    expect(second.state.retried).toBe(false);
  });

  it("체이닝 차단 뒤 다음 tick 응답이 stale 이면 다시 예약", () => {
    let s: GuardState = { retried: false };
    s = fired(step(s, STALE_AT, NOW).state);
    s = step(s, STALE_AT, NOW + STALE_REFETCH_DELAY_MS).state;
    const nextTick = step(s, STALE_AT, NOW + KRX_TTL);
    expect(nextTick.scheduled).toBe(true);
  });

  it("예약이 취소돼 나가지 않았으면 다음 응답은 정상 판정", () => {
    const s = step({ retried: false }, STALE_AT, NOW).state;
    // 언마운트·hidden 으로 발화 없음 → retried 그대로 false
    expect(step(s, STALE_AT, NOW + KRX_TTL).scheduled).toBe(true);
  });

  it("재조회 결과가 fresh 면 이후 응답도 예약 없음", () => {
    let s: GuardState = { retried: false };
    s = fired(step(s, STALE_AT, NOW).state);
    const fresh = step(s, NOW + 500, NOW + STALE_REFETCH_DELAY_MS);
    expect(fresh.scheduled).toBe(false);
    expect(step(fresh.state, NOW + 500, NOW + 10_000).scheduled).toBe(false);
  });
});

describe("scheduleStaleRefetch — 지연·취소·hidden", () => {
  const doc = { hidden: false };
  beforeEach(() => {
    vi.useFakeTimers();
    doc.hidden = false;
    vi.stubGlobal("document", doc);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("3s 뒤 1회 발화", () => {
    const refetch = vi.fn();
    scheduleStaleRefetch(refetch);
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS - 1);
    expect(refetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS * 10);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("cleanup (언마운트·응답 교체) 뒤에는 발화하지 않음", () => {
    const refetch = vi.fn();
    const cancel = scheduleStaleRefetch(refetch);
    cancel();
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("발화 시점에 hidden 이면 버림", () => {
    const refetch = vi.fn();
    scheduleStaleRefetch(refetch);
    doc.hidden = true;
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS);
    expect(refetch).not.toHaveBeenCalled();
  });
});
