import { describe, it, expect } from "vitest";
import { resolveRankingCaption } from "./rankingCaption";

// KST = UTC+9. 2026-07-23(목) 거래일 고정.
const kst = (h: number, min = 0): Date =>
  new Date(Date.UTC(2026, 6, 23, h - 9, min));

describe("resolveRankingCaption", () => {
  it("session 미도달·now=null → null", () => {
    expect(resolveRankingCaption(undefined, kst(10))).toBeNull();
    expect(resolveRankingCaption("regular", null)).toBeNull();
  });

  it("regular → 정규장 · KRX", () => {
    expect(resolveRankingCaption("regular", kst(10))).toBe("정규장 · KRX");
  });

  // 16:00 KRX 애프터마켓 개시 경계 — 15:30~16:00 은 after 세션이지만 KRX 무체결.
  it("after 15:59 → 정규장 마감 · KRX / 16:00 → 애프터마켓 · KRX", () => {
    expect(resolveRankingCaption("after", kst(15, 59))).toBe("정규장 마감 · KRX");
    expect(resolveRankingCaption("after", kst(16, 0))).toBe("애프터마켓 · KRX");
  });

  it("after_close·closed → 애프터마켓 마감 · KRX", () => {
    expect(resolveRankingCaption("after_close", kst(21))).toBe("애프터마켓 마감 · KRX");
    expect(resolveRankingCaption("closed", kst(12))).toBe("애프터마켓 마감 · KRX");
  });

  it("pre 08:10 → 프리마켓 · NXT", () => {
    expect(resolveRankingCaption("pre", kst(8, 10))).toBe("프리마켓 · NXT");
  });

  // preopen 은 08:50 마감 뒤(창 안)와 06:00~08:00(창 밖) 을 한 이름으로 덮는다.
  it("preopen 08:55 (늦은 preopen) → 프리마켓 마감 · NXT", () => {
    expect(resolveRankingCaption("preopen", kst(8, 55))).toBe("프리마켓 마감 · NXT");
  });

  it("preopen 07:00 (이른 preopen) → 애프터마켓 마감 · NXT", () => {
    expect(resolveRankingCaption("preopen", kst(7, 0))).toBe("애프터마켓 마감 · NXT");
  });
});
