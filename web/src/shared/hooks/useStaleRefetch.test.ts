// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RefetchOptions } from "@tanstack/react-query";
import "@/test/domSetup";
import { STALE_REFETCH_DELAY_MS } from "@/shared/utils/staleRefetch";
import { useStaleRefetch } from "./useStaleRefetch";

const NOW = 1_789_015_175_778;
const TTL = 60_000;
// 탭 복귀 3분 — TTL + 여유를 넉넉히 넘겨 재조회 중 시계가 흘러도 stale 판정이 유지되는 나이.
const STALE_AT = NOW - 180_000;

type Response = { fetchedAt: number | null; dataUpdatedAt: number };

const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

const mount = (initial: Response) => {
  const refetch = vi.fn<(options?: RefetchOptions) => Promise<unknown>>(async () => undefined);
  const view = renderHook((res: Response) => useStaleRefetch({ ...res, ttlMs: TTL, refetch }), {
    initialProps: initial,
  });
  return { refetch, ...view };
};

describe("useStaleRefetch — 응답당 1회 재조회", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("stale 응답 → 3s 뒤 진행 중 fetch 에 합류하는 refetch 1회", () => {
    const { refetch } = mount({ fetchedAt: STALE_AT, dataUpdatedAt: NOW });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS - 1);
    expect(refetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false });
  });

  // 재검증 미완료 응답은 같은 엔트리라 structural sharing 으로 fetchedAt 이 같고 dataUpdatedAt 만 바뀐다.
  it("재조회 결과가 또 stale 이어도 다시 예약하지 않음", () => {
    const { refetch, rerender } = mount({ fetchedAt: STALE_AT, dataUpdatedAt: NOW });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS);
    rerender({ fetchedAt: STALE_AT, dataUpdatedAt: Date.now() });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS * 10);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("체이닝 차단 뒤 다음 응답부터 다시 판정", () => {
    const { refetch, rerender } = mount({ fetchedAt: STALE_AT, dataUpdatedAt: NOW });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS);
    rerender({ fetchedAt: STALE_AT, dataUpdatedAt: Date.now() });
    vi.advanceTimersByTime(TTL);
    rerender({ fetchedAt: STALE_AT, dataUpdatedAt: Date.now() });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("fetchedAt null 이면 예약 없음", () => {
    const { refetch } = mount({ fetchedAt: null, dataUpdatedAt: NOW });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS * 10);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("발화 시점에 hidden 이면 버림", () => {
    const { refetch } = mount({ fetchedAt: STALE_AT, dataUpdatedAt: NOW });
    setHidden(true);
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("발화 전에 응답이 바뀌면 이전 예약을 걷어냄", () => {
    const { refetch, rerender } = mount({ fetchedAt: STALE_AT, dataUpdatedAt: NOW });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS - 1_000);
    rerender({ fetchedAt: Date.now(), dataUpdatedAt: Date.now() });
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS * 10);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("언마운트 시 예약 해제", () => {
    const { refetch, unmount } = mount({ fetchedAt: STALE_AT, dataUpdatedAt: NOW });
    unmount();
    vi.advanceTimersByTime(STALE_REFETCH_DELAY_MS);
    expect(refetch).not.toHaveBeenCalled();
  });
});
