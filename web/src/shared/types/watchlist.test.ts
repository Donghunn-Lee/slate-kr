import { describe, it, expect } from "vitest";
import { MAX_WATCHLIST_SIZE } from "@/features/watchlist/store/watchlistSnapshot";
import { watchlistSnapshotSchema } from "./watchlist";

const GID_A = "11111111-1111-4111-8111-111111111111";
const GID_B = "22222222-2222-4222-8222-222222222222";

const baseSnapshot = {
  groups: [
    { id: GID_A, name: "내 관심 종목", order: 0, createdAt: 1_700_000_000_000 },
    { id: GID_B, name: "반도체", order: 1, createdAt: 1_700_000_100_000 },
  ],
  memberships: [
    { groupId: GID_A, ticker: "005930", addedAt: 1_700_000_200_000, order: 0 },
    { groupId: GID_A, ticker: "000660", addedAt: 1_700_000_300_000, order: 1 },
    { groupId: GID_B, ticker: "035420", addedAt: 1_700_000_400_000, order: 0 },
  ],
  stockMeta: {
    "005930": { name: "삼성전자", market: "KOSPI" },
    "000660": { name: "SK하이닉스", market: "KOSPI" },
    "035420": { name: "NAVER", market: "KOSPI" },
  },
};

describe("watchlistSnapshotSchema", () => {
  it("parses a realistic persist v2 snapshot (2 groups · 3 memberships · stockMeta)", () => {
    const parsed = watchlistSnapshotSchema.safeParse(baseSnapshot);
    expect(parsed.success).toBe(true);
  });

  it("parses an empty snapshot (no groups · no memberships · empty stockMeta)", () => {
    const parsed = watchlistSnapshotSchema.safeParse({
      groups: [],
      memberships: [],
      stockMeta: {},
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects memberships array over MAX_WATCHLIST_SIZE", () => {
    const memberships = Array.from({ length: MAX_WATCHLIST_SIZE + 1 }, (_, i) => ({
      groupId: GID_A,
      ticker: String(i).padStart(6, "0"),
      addedAt: 1_700_000_000_000 + i,
      order: i,
    }));
    const stockMeta: Record<string, { name: string; market: "KOSPI" | "KOSDAQ" }> = {};
    for (const m of memberships) {
      stockMeta[m.ticker] = { name: "종목", market: "KOSPI" };
    }
    const parsed = watchlistSnapshotSchema.safeParse({
      groups: baseSnapshot.groups,
      memberships,
      stockMeta,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects ticker not matching 6-char [0-9A-Z] format", () => {
    const parsed = watchlistSnapshotSchema.safeParse({
      ...baseSnapshot,
      memberships: [
        { groupId: GID_A, ticker: "5930", addedAt: 1_700_000_200_000, order: 0 },
      ],
      stockMeta: { "5930": { name: "삼성전자", market: "KOSPI" } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects snapshot with an unknown top-level key (strict)", () => {
    const parsed = watchlistSnapshotSchema.safeParse({
      ...baseSnapshot,
      extra: "nope",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects group object with an unknown key (strict)", () => {
    const parsed = watchlistSnapshotSchema.safeParse({
      ...baseSnapshot,
      groups: [
        { ...baseSnapshot.groups[0], color: "red" },
        baseSnapshot.groups[1],
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
