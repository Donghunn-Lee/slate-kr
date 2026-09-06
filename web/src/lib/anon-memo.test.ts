import { describe, it, expect } from "vitest";
import { parseAnonMemoRow } from "./anon-memo";

const validSnapshot = {
  memos: {
    "005930": {
      body: "메모 내용",
      name: "삼성전자",
      market: "KOSPI",
      updatedAt: "2026-09-05T09:00:00.000Z",
    },
  },
};

describe("parseAnonMemoRow", () => {
  it("returns normalized record for a valid row with Date updated_at", () => {
    const updated = new Date("2026-09-05T09:00:00.000Z");
    const row = { snapshot: validSnapshot, version: 3, updated_at: updated };

    const record = parseAnonMemoRow(row);
    expect(record).not.toBeNull();
    expect(record?.version).toBe(3);
    expect(record?.updatedAt).toBe("2026-09-05T09:00:00.000Z");
    expect(record?.snapshot.memos["005930"].body).toBe("메모 내용");
  });

  it("accepts updated_at delivered as an ISO string", () => {
    const row = {
      snapshot: validSnapshot,
      version: 1,
      updated_at: "2026-09-05T09:00:00.000Z",
    };
    const record = parseAnonMemoRow(row);
    expect(record?.updatedAt).toBe("2026-09-05T09:00:00.000Z");
  });

  it("returns null when snapshot fails schema (bad ticker key)", () => {
    const row = {
      snapshot: {
        memos: {
          bad: {
            body: "메모",
            name: "?",
            market: "KOSPI",
            updatedAt: "2026-09-05T09:00:00.000Z",
          },
        },
      },
      version: 1,
      updated_at: new Date(),
    };
    expect(parseAnonMemoRow(row)).toBeNull();
  });

  it("returns null when version is not a number", () => {
    const row = { snapshot: validSnapshot, version: "1", updated_at: new Date() };
    expect(parseAnonMemoRow(row)).toBeNull();
  });

  it("returns null when updated_at is missing or malformed", () => {
    expect(
      parseAnonMemoRow({ snapshot: validSnapshot, version: 1, updated_at: null })
    ).toBeNull();
    expect(
      parseAnonMemoRow({
        snapshot: validSnapshot,
        version: 1,
        updated_at: "not-a-date",
      })
    ).toBeNull();
  });

  it("returns null for non-object row", () => {
    expect(parseAnonMemoRow(null)).toBeNull();
    expect(parseAnonMemoRow("row")).toBeNull();
  });
});
