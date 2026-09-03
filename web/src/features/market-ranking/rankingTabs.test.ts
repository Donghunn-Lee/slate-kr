import { describe, it, expect } from "vitest";
import {
  DEFAULT_RANKING_TAB_ID,
  RANKING_TABS,
  resolveRankingTab,
  toRankingHref,
  toRankingKind,
} from "./rankingTabs";

describe("resolveRankingTab", () => {
  it("유효 id → 해당 탭 정의", () => {
    expect(resolveRankingTab("market-cap").kind).toBe("market-cap");
    expect(resolveRankingTab("down").kind).toBe("fluctuation");
  });

  it("null/undefined/미지 값 → 기본 탭", () => {
    expect(resolveRankingTab(null).id).toBe(DEFAULT_RANKING_TAB_ID);
    expect(resolveRankingTab(undefined).id).toBe(DEFAULT_RANKING_TAB_ID);
    expect(resolveRankingTab("bogus").id).toBe(DEFAULT_RANKING_TAB_ID);
    expect(resolveRankingTab("").id).toBe(DEFAULT_RANKING_TAB_ID);
  });
});

describe("toRankingKind", () => {
  it("fluctuation 계열 → direction 편입", () => {
    const up = RANKING_TABS.find((t) => t.id === "up")!;
    expect(toRankingKind(up, "kospi")).toEqual({
      kind: "fluctuation",
      direction: "up",
      market: "kospi",
    });
    const down = RANKING_TABS.find((t) => t.id === "down")!;
    expect(toRankingKind(down, "all")).toEqual({
      kind: "fluctuation",
      direction: "down",
      market: "all",
    });
  });

  it("volume 계열 → by 편입", () => {
    const tradeValue = RANKING_TABS.find((t) => t.id === "trade-value")!;
    expect(toRankingKind(tradeValue, "kosdaq")).toEqual({
      kind: "volume",
      by: "value",
      market: "kosdaq",
    });
  });

  it("market-cap · top-interest → market 만", () => {
    const mcap = RANKING_TABS.find((t) => t.id === "market-cap")!;
    expect(toRankingKind(mcap, "all")).toEqual({
      kind: "market-cap",
      market: "all",
    });
    const interest = RANKING_TABS.find((t) => t.id === "top-interest")!;
    expect(toRankingKind(interest, "kosdaq")).toEqual({
      kind: "top-interest",
      market: "kosdaq",
    });
  });
});

describe("toRankingHref", () => {
  it("tab + market 만 세팅", () => {
    expect(toRankingHref("up", "all")).toBe("/ranking?tab=up&market=all");
    expect(toRankingHref("market-cap", "kospi")).toBe(
      "/ranking?tab=market-cap&market=kospi",
    );
    expect(toRankingHref("top-interest", "kosdaq")).toBe(
      "/ranking?tab=top-interest&market=kosdaq",
    );
  });
});

describe("RANKING_TABS", () => {
  it("첫 원소가 기본 탭", () => {
    expect(RANKING_TABS[0].id).toBe(DEFAULT_RANKING_TAB_ID);
  });

  it("id 중복 없음", () => {
    const ids = RANKING_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
