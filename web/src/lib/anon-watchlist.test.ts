import { describe, it, expect } from "vitest";
import { parseAnonWatchlistRow } from "./anon-watchlist";

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

describe("parseAnonWatchlistRow", () => {
  it("returns normalized record for a valid row with Date updated_at", () => {
    const updated = new Date("2026-09-05T09:00:00.000Z");
    const row = { snapshot: validSnapshot, version: 3, updated_at: updated };

    const record = parseAnonWatchlistRow(row);
    expect(record).not.toBeNull();
    expect(record?.version).toBe(3);
    expect(record?.updatedAt).toBe("2026-09-05T09:00:00.000Z");
    expect(record?.snapshot.memberships[0].ticker).toBe("005930");
  });

  it("accepts updated_at delivered as an ISO string", () => {
    const row = {
      snapshot: validSnapshot,
      version: 1,
      updated_at: "2026-09-05T09:00:00.000Z",
    };
    const record = parseAnonWatchlistRow(row);
    expect(record?.updatedAt).toBe("2026-09-05T09:00:00.000Z");
  });

  it("returns null when snapshot fails schema (bad ticker)", () => {
    const row = {
      snapshot: {
        ...validSnapshot,
        memberships: [
          { groupId: GID, ticker: "bad", addedAt: 1_700_000_200_000, order: 0 },
        ],
        stockMeta: { bad: { name: "?", market: "KOSPI" } },
      },
      version: 1,
      updated_at: new Date(),
    };
    expect(parseAnonWatchlistRow(row)).toBeNull();
  });

  it("returns null when version is not a number", () => {
    const row = { snapshot: validSnapshot, version: "1", updated_at: new Date() };
    expect(parseAnonWatchlistRow(row)).toBeNull();
  });

  it("returns null when updated_at is missing or malformed", () => {
    expect(
      parseAnonWatchlistRow({ snapshot: validSnapshot, version: 1, updated_at: null })
    ).toBeNull();
    expect(
      parseAnonWatchlistRow({
        snapshot: validSnapshot,
        version: 1,
        updated_at: "not-a-date",
      })
    ).toBeNull();
  });

  it("returns null for non-object row", () => {
    expect(parseAnonWatchlistRow(null)).toBeNull();
    expect(parseAnonWatchlistRow("row")).toBeNull();
  });
});
