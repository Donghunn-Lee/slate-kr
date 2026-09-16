import { describe, it, expect } from "vitest";
import type { KrxSession } from "./market";
import { shouldShowAfterHoursBadge } from "./shouldShowAfterHoursBadge";

const SESSIONS: Array<KrxSession | undefined> = [
  "regular", "after", "after_close", "pre", "preopen", "closed", undefined,
];

const show = (
  source: "krx" | "nx" | "un",
  session: KrxSession | undefined,
  krxAfterMarketOpen = false,
): boolean => shouldShowAfterHoursBadge({ quote: { source }, session, krxAfterMarketOpen });

describe("shouldShowAfterHoursBadge", () => {
  it("quote 부재 → false (EOD 만 표시 중, 세션 무관)", () => {
    for (const session of SESSIONS) {
      for (const open of [false, true]) {
        expect(shouldShowAfterHoursBadge({ quote: null, session, krxAfterMarketOpen: open })).toBe(false);
        expect(shouldShowAfterHoursBadge({ quote: undefined, session, krxAfterMarketOpen: open })).toBe(false);
      }
    }
  });

  // ── source 축 ────────────────────────────────────────
  it("krx 단독 체결가 → false (세션·16:00 무관)", () => {
    for (const session of SESSIONS) {
      for (const open of [false, true]) {
        expect(show("krx", session, open)).toBe(false);
      }
    }
  });

  // ── 애프터 계열: un · nx 동형 ────────────────────────
  // 15:30~16:00 의 after 는 정규장 마감 구간(값은 15:30 종가) — 16:00 경계를 넘어야 애프터마켓 체결.
  it("un · nx × after × 16:00 전 → false", () => {
    for (const source of ["un", "nx"] as const) {
      expect(show(source, "after", false)).toBe(false);
    }
  });

  it("un · nx × after × 16:00 이후 → true", () => {
    for (const source of ["un", "nx"] as const) {
      expect(show(source, "after", true)).toBe(true);
    }
  });

  // 밤(after_close·closed)의 값은 애프터마켓 마감값 — 전 종목에 붙는 것이 의도.
  it("un · nx × after_close / closed → true (16:00 플래그 무관)", () => {
    for (const source of ["un", "nx"] as const) {
      for (const session of ["after_close", "closed"] as const) {
        for (const open of [false, true]) {
          expect(show(source, session, open)).toBe(true);
        }
      }
    }
  });

  // ── 프리마켓: nx 만 ──────────────────────────────────
  // pre 의 UN 값은 비NXT 종목이면 전일 종가 그대로라 프리마켓 값이라 단정할 수 없다.
  it("nx × pre → true · un × pre → false", () => {
    expect(show("nx", "pre")).toBe(true);
    expect(show("un", "pre")).toBe(false);
  });

  // ── 그 외 세션 ───────────────────────────────────────
  it("un · nx × regular → false (장중 전 종목 상시 노출 방지)", () => {
    for (const source of ["un", "nx"] as const) {
      for (const open of [false, true]) {
        expect(show(source, "regular", open)).toBe(false);
      }
    }
  });

  it("un · nx × preopen / session 미도착 → false", () => {
    for (const source of ["un", "nx"] as const) {
      for (const session of ["preopen", undefined] as const) {
        expect(show(source, session)).toBe(false);
      }
    }
  });
});
