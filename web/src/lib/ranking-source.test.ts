import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { getDailyBar, getTickerProfile } from "@/lib/demo/price-model";
import { fetchRanking, rankingMarketDiv } from "./ranking-source";
import type { MarketRankingKind } from "@/shared/types/ranking";

// 30 종목 고정 universe — 전부가 한 순위 안에 들어와 changeSign 5종을 한 번에 본다.
// 연속 거래일 핀(12-29 → 12-30)은 하루 ±30% 를 넘겨 그날 종가를 상 · 하한에 붙이고,
// 같은 값 핀은 보합을 만든다. 20:00 종가는 정규장 종가에서 더 흔들리므로 후보를 여럿 둔다.
const universeCalls = vi.fn();
vi.mock("@/lib/demo/universe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo/universe")>();
  const { getTickerProfile } = await import("@/lib/demo/price-model");
  const entries: Awaited<ReturnType<typeof actual.getDemoUniverse>> = [];
  const push = (ticker: string, i: number, pins?: { date: string; price: number }[]) =>
    entries.push({
      ticker,
      name: `종목${ticker}`,
      market: i % 2 === 0 ? ("KOSPI" as const) : ("KOSDAQ" as const),
      shares: ticker.startsWith("5") ? null : 1_000_000 * (i + 1),
      listedAt: "2000-01-01",
      profile: getTickerProfile(ticker, { eps: 5_000, bps: 40_000, pins }),
    });
  for (let i = 0; i < 12; i++) push(String(100_001 + i), i);
  for (let i = 0; i < 6; i++)
    push(String(200_001 + i), i, [{ date: "2025-12-29", price: 1_000 }, { date: "2025-12-30", price: 2_000 }]);
  for (let i = 0; i < 6; i++)
    push(String(300_001 + i), i, [{ date: "2025-12-29", price: 1_000 }, { date: "2025-12-30", price: 500 }]);
  for (let i = 0; i < 5; i++)
    push(String(400_001 + i), i, [{ date: "2025-12-29", price: 100 }, { date: "2025-12-30", price: 100 }]);
  push("500001", 0);
  return {
    ...actual,
    getDemoUniverse: async () => {
      universeCalls();
      return entries;
    },
  };
});

const kst = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)) - 9, Number(hhmm.slice(2, 4))));
};
const UP: MarketRankingKind = { kind: "fluctuation", direction: "up", market: "all" };
const DOWN: MarketRankingKind = { kind: "fluctuation", direction: "down", market: "all" };
const VOLUME: MarketRankingKind = { kind: "volume", by: "volume", market: "all" };
const VALUE: MarketRankingKind = { kind: "volume", by: "value", market: "kospi" };
const MCAP: MarketRankingKind = { kind: "market-cap", market: "all" };
const INTEREST: MarketRankingKind = { kind: "top-interest", market: "kosdaq" };

const items = async (kind: MarketRankingKind, session: "after_close" | "closed" | "regular" = "after_close") => {
  const r = await fetchRanking(kind, session);
  if (!r.ok) throw new Error(r.error.message);
  return r.items;
};

describe("fetchRanking", () => {
  beforeEach(() => {
    universeCalls.mockClear();
    vi.useFakeTimers({ now: kst("2025-12-30", "2100") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("등락률 정렬 · rank 1부터 · 30건", async () => {
    const up = await items(UP);
    expect(up).toHaveLength(30);
    expect(up.map((i) => i.rank)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (let i = 1; i < up.length; i++) expect(up[i - 1].changePct).toBeGreaterThanOrEqual(up[i].changePct);
    const down = await items(DOWN);
    for (let i = 1; i < down.length; i++) expect(down[i - 1].changePct).toBeLessThanOrEqual(down[i].changePct);
    expect(up[0].volume).toBeGreaterThan(0);
    expect(up[0].tradeValue).toBeUndefined();
  });

  it("market 필터 · kind 별 필드 · 시총은 shares 없는 종목 제외", async () => {
    const value = await items(VALUE);
    expect(value.every((i) => i.market === "KOSPI")).toBe(true);
    for (let i = 1; i < value.length; i++) expect(value[i - 1].tradeValue ?? 0).toBeGreaterThanOrEqual(value[i].tradeValue ?? 0);
    expect(value[0].tradeValue).toBe(value[0].price * (value[0].volume ?? 0));

    const mcap = await items(MCAP);
    expect(mcap.map((i) => i.ticker)).not.toContain("500001");
    expect(mcap).toHaveLength(29);
    for (let i = 1; i < mcap.length; i++) expect(mcap[i - 1].marketCap ?? 0).toBeGreaterThanOrEqual(mcap[i].marketCap ?? 0);
    expect(mcap[0].marketCap).toBe(mcap[0].price * ((mcap[0].volume ?? 0) > 0 ? mcap[0].marketCap! / mcap[0].price : 0));

    const interest = await items(INTEREST);
    expect(interest.every((i) => i.market === "KOSDAQ")).toBe(true);
    for (let i = 1; i < interest.length; i++) expect(interest[i - 1].interestCount ?? 0).toBeGreaterThanOrEqual(interest[i].interestCount ?? 0);
    expect(interest[0].tradeValue).toBeDefined();
  });

  it("changeSign 1·2·3·4·5 전부 등장", async () => {
    const signs = new Set((await items(VOLUME)).map((i) => i.changeSign));
    expect([...signs].sort()).toEqual(["1", "2", "3", "4", "5"]);
    const limitUp = (await items(UP)).find((i) => i.changeSign === "1");
    expect(limitUp?.price).toBe(1_300);
    expect(limitUp?.change).toBe(300);
  });

  it("closed 세션은 직전 거래일 EOD 값 · 같은 분 안에서 universe 는 1회", async () => {
    vi.setSystemTime(kst("2026-01-03", "1200"));
    const rows = await items(VOLUME, "closed");
    const plain = rows.find((i) => i.ticker === "100001");
    const profile = getTickerProfile("100001", { eps: 5_000, bps: 40_000 });
    expect(plain?.price).toBe(getDailyBar("100001", profile, "2026-01-02").close);
    await items(UP, "closed");
    await items(MCAP, "closed");
    expect(universeCalls).toHaveBeenCalledTimes(1);
  });

  it("rankingMarketDiv: 개장 전은 NX, 그 외 UN", () => {
    expect(rankingMarketDiv("pre")).toBe("NX");
    expect(rankingMarketDiv("preopen")).toBe("NX");
    expect(rankingMarketDiv("regular")).toBe("UN");
    expect(rankingMarketDiv("closed")).toBe("UN");
  });
});
