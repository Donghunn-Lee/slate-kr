// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import "@/test/domSetup";
import { SYNC_MARKER_COOKIE } from "@/shared/constants/syncMarkerCookie";
import { useWatchlistStore } from "./store/useWatchlistStore";
import { useWatchlistSync } from "./useWatchlistSync";

describe("useWatchlistSync 쓰기 차단", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 마커가 있어야 GET 을 시도한다 — 없으면 서버 없음으로 확정하고 바로 synced.
    document.cookie = `${SYNC_MARKER_COOKIE}=1`;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.cookie = `${SYNC_MARKER_COOKIE}=; max-age=0`;
  });

  it("GET 재시도까지 실패 → blocked, 이후 편집해도 PUT 없음", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useWatchlistSync());
    await vi.advanceTimersByTimeAsync(2000); // GET 재시도 간격
    expect(useWatchlistStore.getState().syncStatus).toBe("blocked");

    useWatchlistStore
      .getState()
      .addToWatchlist({ ticker: "005930", name: "삼성전자", market: "KOSPI" });
    // PUT debounce(300ms) 와 실패 재시도(1s) 를 모두 넘기는 창.
    await vi.advanceTimersByTimeAsync(2000);

    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "GET"]);
  });
});
