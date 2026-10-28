// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/test/domSetup";
import { useStockIntraday, type StockIntradayResponse } from "./useStockIntraday";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음). 2026-07-23 은 목요일 거래일.
const kst = (h: number, min: number, sec = 0): Date =>
  new Date(Date.UTC(2026, 6, 23, h - 9, min, sec));

const PREOPEN: StockIntradayResponse = {
  bars: [],
  session: "preopen",
  date: "2026-07-22",
  previousDay: true,
  failed: false,
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

const setVisibility = (state: DocumentVisibilityState) =>
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });

// 마운트 fetch 가 끝난 뒤의 호출 수를 센다 — 폴링 틱만 본다.
const mountAt = async (now: Date) => {
  vi.setSystemTime(now);
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(PREOPEN));
  vi.stubGlobal("fetch", fetchMock);
  renderHook(() => useStockIntraday("005930"), { wrapper });
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return fetchMock;
};

const tick = () => act(() => vi.advanceTimersByTimeAsync(60_000));

describe("useStockIntraday 폴링 재개 — 클라 시계 축", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setVisibility("visible");
  });

  it("08:58:30 preopen 응답으로 연 탭 → 08:59:30 틱 fetch 없음, 09:00:30 틱 fetch 1회", async () => {
    const fetchMock = await mountAt(kst(8, 58, 30));

    await tick(); // 08:59:30 늦은 preopen
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await tick(); // 09:00:30 regular
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hidden 탭은 정규장 틱에도 fetch 없음", async () => {
    const fetchMock = await mountAt(kst(8, 59, 30));
    setVisibility("hidden");

    await tick(); // 09:00:30 regular
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
