import { describe, it, expect } from "vitest";
import {
  MAX_MEMO_BODY_LENGTH,
  MAX_MEMO_COUNT,
  memoSnapshotSchema,
} from "./memo";

const validEntry = {
  body: "메모 내용",
  name: "삼성전자",
  market: "KOSPI",
  updatedAt: "2026-09-05T09:00:00.000Z",
};

describe("memoSnapshotSchema", () => {
  it("accepts a valid snapshot", () => {
    const result = memoSnapshotSchema.safeParse({
      memos: { "005930": validEntry },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = memoSnapshotSchema.safeParse({
      memos: { "005930": { ...validEntry, body: "" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a body over MAX_MEMO_BODY_LENGTH", () => {
    const result = memoSnapshotSchema.safeParse({
      memos: {
        "005930": { ...validEntry, body: "a".repeat(MAX_MEMO_BODY_LENGTH + 1) },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a ticker key that violates the format", () => {
    const result = memoSnapshotSchema.safeParse({
      memos: { bad: validEntry },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a snapshot exceeding MAX_MEMO_COUNT entries", () => {
    const memos: Record<string, typeof validEntry> = {};
    for (let i = 0; i <= MAX_MEMO_COUNT; i += 1) {
      const ticker = i.toString().padStart(6, "0");
      memos[ticker] = validEntry;
    }
    const result = memoSnapshotSchema.safeParse({ memos });
    expect(result.success).toBe(false);
  });

  it("rejects extra top-level keys (strict)", () => {
    const result = memoSnapshotSchema.safeParse({
      memos: { "005930": validEntry },
      extra: 1,
    });
    expect(result.success).toBe(false);
  });
});
