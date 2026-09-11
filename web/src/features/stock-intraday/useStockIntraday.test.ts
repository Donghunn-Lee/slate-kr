import { describe, it, expect } from "vitest";
import { getKrxSessionState, isKrxActiveSession } from "@/shared/utils/market";
import {
  keepLastGoodIntraday,
  type StockIntradayResponse,
} from "./useStockIntraday";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음).
const kst = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 2026-07-23 은 목요일 거래일, 2026-07-25 은 토요일, 2026-01-01 은 휴장일.
const t = (h: number, min = 0): Date => kst(2026, 7, 23, h, min);

// useStockIntraday 의 refetchOnWindowFocus 조립식. 훅은 vitest node 환경에서 렌더할 수
// 없으므로 useMultiQuote.test.ts 관례대로 테스트에 복제해 고정한다.
const refetchOnFocus = (now: Date): boolean =>
  isKrxActiveSession(getKrxSessionState(now));

describe("useStockIntraday 복귀 refetch 게이트 — 클라 시계 축", () => {
  it("09:30 regular → true", () => {
    expect(refetchOnFocus(t(9, 30))).toBe(true);
  });
  it("16:00 after → true (NXT 애프터 라이브)", () => {
    expect(refetchOnFocus(t(16, 0))).toBe(true);
  });
  it("08:20 pre → true", () => {
    expect(refetchOnFocus(t(8, 20))).toBe(true);
  });
  it("07:30 이른 preopen → false", () => {
    expect(refetchOnFocus(t(7, 30))).toBe(false);
  });
  it("08:55 늦은 preopen → false", () => {
    expect(refetchOnFocus(t(8, 55))).toBe(false);
  });
  it("21:00 after_close → false (마감 후 복귀는 KIS 콜 없음)", () => {
    expect(refetchOnFocus(t(21, 0))).toBe(false);
  });
  it("토요일 10:00 → false", () => {
    expect(refetchOnFocus(kst(2026, 7, 25, 10, 0))).toBe(false);
  });
  it("휴장일 10:00 → false", () => {
    expect(refetchOnFocus(kst(2026, 1, 1, 10, 0))).toBe(false);
  });
  // 응답 session 축(refetchInterval 게이트)은 폴링이 멈춘 뒤 갱신되지 않는다 —
  // preopen 응답을 쥔 탭이 정규장에 복귀하면 클라 시계 축만 재개를 열어 준다.
  it("정지된 preopen 응답 + 09:30 복귀 → 응답 축 false, 시계 축 true", () => {
    expect(isKrxActiveSession("preopen")).toBe(false);
    expect(refetchOnFocus(t(9, 30))).toBe(true);
  });
});

// ── keepLastGoodIntraday: failed 응답의 캐시 미점유 ──
describe("keepLastGoodIntraday", () => {
  const bar = { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 };
  const res = (over: Partial<StockIntradayResponse>): StockIntradayResponse => ({
    bars: [bar],
    session: "regular",
    date: "2026-09-11",
    previousDay: false,
    failed: false,
    ...over,
  });

  it("정상 응답 → 그대로 교체", () => {
    const next = res({});
    expect(keepLastGoodIntraday(res({ bars: [] }), next)).toBe(next);
  });

  it("failed + 직전 정상본 → 직전본 유지 (결손 봉이 덮지 않는다)", () => {
    const prev = res({});
    const out = keepLastGoodIntraday(prev, res({ bars: [], failed: true }));
    expect(out.bars).toBe(prev.bars);
    expect(out.failed).toBe(false);
  });

  // 직전본이 after_close 였으면 게이트가 닫힌 채 갇히므로 session 축만 새 응답을 따른다.
  it("failed + 직전 정상본 → session 은 새 응답 것", () => {
    const prev = res({ session: "after_close" });
    const out = keepLastGoodIntraday(prev, res({ failed: true }));
    expect(out.session).toBe("regular");
    expect(out.bars).toBe(prev.bars);
  });

  it("failed + 직전본 없음(첫 로드) → 결손본 그대로 (failed UI 경로)", () => {
    const next = res({ failed: true });
    expect(keepLastGoodIntraday(undefined, next)).toBe(next);
  });

  it("failed + 직전본도 failed → 새 결손본으로 교체", () => {
    const next = res({ failed: true });
    expect(keepLastGoodIntraday(res({ bars: [], failed: true }), next)).toBe(next);
  });
});
