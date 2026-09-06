import { describe, expect, it } from "vitest";
import { isSnapshotEqual, selectSnapshot } from "./memoSnapshot";
import type { MemoSnapshot } from "@/shared/types/memo";

const baseSnapshot: MemoSnapshot = {
  memos: {
    "005930": {
      body: "삼성전자 메모",
      name: "삼성전자",
      market: "KOSPI",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    "000660": {
      body: "SK하이닉스 메모",
      name: "SK하이닉스",
      market: "KOSPI",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  },
};

describe("selectSnapshot", () => {
  it("returns only the memos field — no syncStatus / actions", () => {
    const state = {
      ...baseSnapshot,
      syncStatus: "synced" as const,
      setSyncStatus: () => {},
      setMemo: () => {},
    };
    const snap = selectSnapshot(state);
    expect(Object.keys(snap)).toEqual(["memos"]);
    expect(snap.memos).toBe(state.memos);
  });
});

describe("isSnapshotEqual", () => {
  it("returns true for structurally identical snapshots", () => {
    const clone: MemoSnapshot = {
      memos: { ...baseSnapshot.memos },
    };
    expect(isSnapshotEqual(baseSnapshot, clone)).toBe(true);
  });

  it("returns true when memos key insertion order differs", () => {
    const reordered: MemoSnapshot = {
      memos: {
        "000660": baseSnapshot.memos["000660"],
        "005930": baseSnapshot.memos["005930"],
      },
    };
    expect(isSnapshotEqual(baseSnapshot, reordered)).toBe(true);
  });

  it("returns false when a memo body differs", () => {
    const changed: MemoSnapshot = {
      memos: {
        ...baseSnapshot.memos,
        "005930": { ...baseSnapshot.memos["005930"], body: "다른 본문" },
      },
    };
    expect(isSnapshotEqual(baseSnapshot, changed)).toBe(false);
  });

  it("returns false when a memo key is added or removed", () => {
    const removed: MemoSnapshot = {
      memos: { "005930": baseSnapshot.memos["005930"] },
    };
    expect(isSnapshotEqual(baseSnapshot, removed)).toBe(false);
  });

  it("returns false when one side is null", () => {
    expect(isSnapshotEqual(baseSnapshot, null)).toBe(false);
    expect(isSnapshotEqual(null, baseSnapshot)).toBe(false);
    expect(isSnapshotEqual(null, null)).toBe(true);
  });
});
