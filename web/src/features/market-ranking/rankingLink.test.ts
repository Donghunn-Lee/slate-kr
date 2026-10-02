import { describe, it, expect } from "vitest";
import { isRankingRowLinkable } from "./rankingLink";

describe("isRankingRowLinkable", () => {
  it("매핑 조회 성공 + market 있음 → 링크", () => {
    expect(isRankingRowLinkable({ market: "KOSPI" }, true)).toBe(true);
  });

  it("매핑 조회 성공 + market 없음 → 비링크", () => {
    expect(isRankingRowLinkable({}, true)).toBe(false);
  });

  it("매핑 조회 실패 → market 유무와 무관하게 링크", () => {
    expect(isRankingRowLinkable({}, false)).toBe(true);
    expect(isRankingRowLinkable({ market: "KOSDAQ" }, false)).toBe(true);
  });
});
