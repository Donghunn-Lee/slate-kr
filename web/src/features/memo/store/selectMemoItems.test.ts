import { describe, expect, it } from "vitest";
import { selectMemoItems } from "./selectMemoItems";
import type { MemoEntry } from "@/shared/types/memo";

const makeEntry = (
  name: string,
  updatedAt: string,
  market: MemoEntry["market"] = "KOSPI",
): MemoEntry => ({
  body: `${name} 메모`,
  name,
  market,
  updatedAt,
});

describe("selectMemoItems", () => {
  it("returns an empty array for an empty memos record", () => {
    expect(selectMemoItems({})).toEqual([]);
  });

  it("sorts entries by updatedAt descending", () => {
    const memos: Record<string, MemoEntry> = {
      "005930": makeEntry("삼성전자", "2026-01-01T00:00:00.000Z"),
      "000660": makeEntry("SK하이닉스", "2026-03-01T00:00:00.000Z"),
      "035420": makeEntry("NAVER", "2026-02-01T00:00:00.000Z"),
    };
    expect(selectMemoItems(memos).map((i) => i.ticker)).toEqual([
      "000660",
      "035420",
      "005930",
    ]);
  });

  it("maps ticker/name/market and drops body/updatedAt", () => {
    const memos: Record<string, MemoEntry> = {
      "005930": makeEntry("삼성전자", "2026-01-01T00:00:00.000Z", "KOSPI"),
      "247540": makeEntry("에코프로비엠", "2026-01-02T00:00:00.000Z", "KOSDAQ"),
    };
    expect(selectMemoItems(memos)).toEqual([
      { ticker: "247540", name: "에코프로비엠", market: "KOSDAQ" },
      { ticker: "005930", name: "삼성전자", market: "KOSPI" },
    ]);
  });
});
