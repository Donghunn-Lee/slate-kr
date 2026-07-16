import { describe, it, expect } from "vitest";
import { resampleToMonthly } from "./resampleToMonthly";
import type { IndexDailySnapshot } from "@/shared/types/quote";

const mk = (date: string, o: Partial<IndexDailySnapshot> = {}): IndexDailySnapshot => ({
  indexCode: "KOSPI",
  date,
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  change: 0,
  changeRate: 0,
  ...o,
});

describe("resampleToMonthly", () => {
  it("빈 배열 → []", () => {
    expect(resampleToMonthly([])).toEqual([]);
  });

  it("1개월 다중 일자 → 1개 그룹, 출력 date=YYYY-MM-01, OHLC 집계", () => {
    const days = [
      mk("2026-01-05", { open: 100, high: 105, low: 98, close: 102 }),
      mk("2026-01-15", { open: 102, high: 110, low: 101, close: 108 }),
      mk("2026-01-30", { open: 108, high: 112, low: 106, close: 111 }),
    ];
    const result = resampleToMonthly(days);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-01-01");
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(111);
    expect(result[0].high).toBe(112);
    expect(result[0].low).toBe(98);
    expect(result[0].change).toBe(11);
    expect(result[0].changeRate).toBeCloseTo(11);
  });

  it("월 경계 걸침 (1/31 → 2/1) → 2개 그룹으로 분할", () => {
    const days = [
      mk("2026-01-31", { open: 100, close: 105 }),
      mk("2026-02-01", { open: 105, close: 110 }),
    ];
    const result = resampleToMonthly(days);
    expect(result).toHaveLength(2);
    const byDate = Object.fromEntries(result.map((r) => [r.date, r]));
    expect(byDate["2026-01-01"]).toBeDefined();
    expect(byDate["2026-02-01"]).toBeDefined();
  });

  it("연 경계 걸침 (12/30 → 1/5) → 2개 그룹으로 분할", () => {
    const days = [
      mk("2025-12-30", { open: 100, close: 102 }),
      mk("2026-01-05", { open: 102, close: 108 }),
    ];
    const result = resampleToMonthly(days);
    expect(result).toHaveLength(2);
    const byDate = Object.fromEntries(result.map((r) => [r.date, r]));
    expect(byDate["2025-12-01"]).toBeDefined();
    expect(byDate["2026-01-01"]).toBeDefined();
  });

  it("입력 순서 뒤섞임 → 내부 정렬 후 open=oldest, close=newest", () => {
    const days = [
      mk("2026-01-30", { open: 108, close: 111 }),
      mk("2026-01-05", { open: 100, close: 102 }),
      mk("2026-01-15", { open: 102, close: 108 }),
    ];
    const result = resampleToMonthly(days);
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(111);
  });

  it("first.open === 0 → changeRate 0 (0나눗셈 회피)", () => {
    const days = [mk("2026-01-05", { open: 0, high: 10, low: 0, close: 5 })];
    const result = resampleToMonthly(days);
    expect(result[0].change).toBe(5);
    expect(result[0].changeRate).toBe(0);
  });
});
