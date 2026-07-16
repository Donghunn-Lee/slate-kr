import { describe, it, expect } from "vitest";
import { resampleToWeekly } from "./resampleToWeekly";
import type { IndexDailySnapshot } from "@/shared/types/quote";

// 2026-01-01은 목요일이므로 2026-01-05(월)~2026-01-11(일)이 한 ISO 주.
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

describe("resampleToWeekly", () => {
  it("빈 배열 → []", () => {
    expect(resampleToWeekly([])).toEqual([]);
  });

  it("단일 일자 → 1주 스냅샷, 출력 date = 해당 주의 월요일", () => {
    const result = resampleToWeekly([
      mk("2026-01-07", { open: 100, high: 110, low: 95, close: 105 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-01-05");
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(105);
    expect(result[0].high).toBe(110);
    expect(result[0].low).toBe(95);
    expect(result[0].change).toBe(5);
    expect(result[0].changeRate).toBeCloseTo(5);
  });

  it("정확히 한 주 (Mon~Fri) → 1개 그룹, OHLC 집계", () => {
    const days = [
      mk("2026-01-05", { open: 100, high: 105, low: 98, close: 102 }),
      mk("2026-01-06", { open: 102, high: 108, low: 100, close: 106 }),
      mk("2026-01-07", { open: 106, high: 110, low: 104, close: 108 }),
      mk("2026-01-08", { open: 108, high: 112, low: 106, close: 111 }),
      mk("2026-01-09", { open: 111, high: 115, low: 109, close: 114 }),
    ];
    const result = resampleToWeekly(days);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-01-05");
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(114);
    expect(result[0].high).toBe(115);
    expect(result[0].low).toBe(98);
    expect(result[0].change).toBe(14);
    expect(result[0].changeRate).toBeCloseTo(14);
  });

  it("주 경계 걸침 (Fri → 다음 Mon) → 2개 그룹으로 분할", () => {
    const days = [
      mk("2026-01-09", { open: 100, close: 102 }),
      mk("2026-01-12", { open: 102, close: 108 }),
    ];
    const result = resampleToWeekly(days);
    expect(result).toHaveLength(2);
    const byDate = Object.fromEntries(result.map((r) => [r.date, r]));
    expect(byDate["2026-01-05"]).toBeDefined();
    expect(byDate["2026-01-12"]).toBeDefined();
  });

  it("주 중간 결측일 (Mon, Wed, Fri만 존재) → 존재하는 값만으로 집계", () => {
    const days = [
      mk("2026-01-05", { open: 100, high: 105, low: 98, close: 102 }),
      mk("2026-01-07", { open: 102, high: 110, low: 100, close: 106 }),
      mk("2026-01-09", { open: 106, high: 108, low: 104, close: 107 }),
    ];
    const result = resampleToWeekly(days);
    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(107);
    expect(result[0].high).toBe(110);
    expect(result[0].low).toBe(98);
  });

  it("입력 순서 뒤섞임 → 내부 정렬 후 open=oldest, close=newest", () => {
    const days = [
      mk("2026-01-09", { open: 111, close: 114 }),
      mk("2026-01-05", { open: 100, close: 102 }),
      mk("2026-01-07", { open: 106, close: 108 }),
    ];
    const result = resampleToWeekly(days);
    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(114);
  });

  it("first.open === 0 → changeRate 0 (0나눗셈 회피)", () => {
    const days = [mk("2026-01-05", { open: 0, high: 10, low: 0, close: 5 })];
    const result = resampleToWeekly(days);
    expect(result[0].change).toBe(5);
    expect(result[0].changeRate).toBe(0);
  });
});
