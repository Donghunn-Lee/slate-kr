import { describe, it, expect } from "vitest";
import { parsePutBody } from "./parsePutBody";
import { watchlistSnapshotSchema } from "@/shared/types/watchlist";

const GID = "11111111-1111-4111-8111-111111111111";

const validSnapshot = {
  groups: [{ id: GID, name: "내 관심 종목", order: 0, createdAt: 1_700_000_000_000 }],
  memberships: [
    { groupId: GID, ticker: "005930", addedAt: 1_700_000_200_000, order: 0 },
  ],
  stockMeta: {
    "005930": { name: "삼성전자", market: "KOSPI" },
  },
};

describe("parsePutBody", () => {
  it("returns snapshot for a valid JSON body", () => {
    const result = parsePutBody(
      JSON.stringify(validSnapshot),
      watchlistSnapshotSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.memberships[0].ticker).toBe("005930");
    }
  });

  it("returns 413 too_large when body exceeds 64KB", () => {
    // 64KB + 1 ASCII byte body — parse는 시도조차 하지 않는다.
    const oversized = "x".repeat(64 * 1024 + 1);
    const result = parsePutBody(oversized, watchlistSnapshotSchema);
    expect(result).toEqual({ ok: false, status: 413, kind: "too_large" });
  });

  it("returns 400 invalid_json when body is not JSON", () => {
    const result = parsePutBody("not json", watchlistSnapshotSchema);
    expect(result).toEqual({ ok: false, status: 400, kind: "invalid_json" });
  });

  it("returns 400 invalid_snapshot when JSON does not match schema", () => {
    const result = parsePutBody(JSON.stringify({}), watchlistSnapshotSchema);
    expect(result).toEqual({ ok: false, status: 400, kind: "invalid_snapshot" });
  });

  it("returns 400 invalid_snapshot for extra top-level keys (strict guard)", () => {
    const result = parsePutBody(
      JSON.stringify({ ...validSnapshot, extra: 1 }),
      watchlistSnapshotSchema
    );
    expect(result).toEqual({ ok: false, status: 400, kind: "invalid_snapshot" });
  });
});
