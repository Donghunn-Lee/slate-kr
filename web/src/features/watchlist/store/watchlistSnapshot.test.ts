import { describe, expect, it } from "vitest";
import { isSnapshotEqual, selectSnapshot } from "./watchlistSnapshot";
import type { WatchlistSnapshot } from "@/shared/types/watchlist";

const GID_A = "11111111-1111-4111-8111-111111111111";
const GID_B = "22222222-2222-4222-8222-222222222222";

const baseSnapshot: WatchlistSnapshot = {
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

describe("selectSnapshot", () => {
  it("returns only the three data fields — no syncStatus / actions", () => {
    const state = {
      ...baseSnapshot,
      syncStatus: "synced" as const,
      setSyncStatus: () => {},
      createGroup: () => {},
    };
    const snap = selectSnapshot(state);
    expect(Object.keys(snap).sort()).toEqual([
      "groups",
      "memberships",
      "stockMeta",
    ]);
    expect(snap.groups).toBe(state.groups);
    expect(snap.memberships).toBe(state.memberships);
    expect(snap.stockMeta).toBe(state.stockMeta);
  });
});

describe("isSnapshotEqual", () => {
  it("returns true for structurally identical snapshots", () => {
    const clone: WatchlistSnapshot = {
      groups: [...baseSnapshot.groups],
      memberships: [...baseSnapshot.memberships],
      stockMeta: { ...baseSnapshot.stockMeta },
    };
    expect(isSnapshotEqual(baseSnapshot, clone)).toBe(true);
  });

  it("returns true when stockMeta key insertion order differs", () => {
    const reordered: WatchlistSnapshot = {
      ...baseSnapshot,
      stockMeta: {
        "035420": { name: "NAVER", market: "KOSPI" },
        "000660": { name: "SK하이닉스", market: "KOSPI" },
        "005930": { name: "삼성전자", market: "KOSPI" },
      },
    };
    expect(isSnapshotEqual(baseSnapshot, reordered)).toBe(true);
  });

  it("returns false when memberships array order differs", () => {
    const reordered: WatchlistSnapshot = {
      ...baseSnapshot,
      memberships: [
        baseSnapshot.memberships[1],
        baseSnapshot.memberships[0],
        baseSnapshot.memberships[2],
      ],
    };
    expect(isSnapshotEqual(baseSnapshot, reordered)).toBe(false);
  });

  it("returns false when a group name differs", () => {
    const renamed: WatchlistSnapshot = {
      ...baseSnapshot,
      groups: [
        { ...baseSnapshot.groups[0], name: "다른 이름" },
        baseSnapshot.groups[1],
      ],
    };
    expect(isSnapshotEqual(baseSnapshot, renamed)).toBe(false);
  });

  it("returns false when one side is null", () => {
    expect(isSnapshotEqual(baseSnapshot, null)).toBe(false);
    expect(isSnapshotEqual(null, baseSnapshot)).toBe(false);
    expect(isSnapshotEqual(null, null)).toBe(true);
  });
});
