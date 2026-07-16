import { describe, it, expect } from "vitest";
import { resampleIntradayBars } from "./resampleIntradayBars";
import type { ChartBar } from "@/shared/types/quote";

const mk = (time: number | string, o: Partial<ChartBar> = {}): ChartBar => ({
  time,
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  ...o,
});

describe("resampleIntradayBars", () => {
  it("빈 배열 → []", () => {
    expect(resampleIntradayBars([], 5)).toEqual([]);
  });

  it("minutes=1 → raw 그대로 반환 (동일 참조, 무집계)", () => {
    const bars: ChartBar[] = [mk(60, { close: 101 }), mk(120, { close: 103 })];
    expect(resampleIntradayBars(bars, 1)).toBe(bars);
  });

  it("minutes=0 → raw 그대로 반환 (경계: minutes <= 1)", () => {
    const bars: ChartBar[] = [mk(60), mk(120)];
    expect(resampleIntradayBars(bars, 0)).toBe(bars);
  });

  it("정확히 5분 배수 3개 → 5분봉 3개 (버킷 경계 정렬)", () => {
    const bars = [
      mk(0, { open: 100, high: 105, low: 99, close: 102, volume: 10 }),
      mk(300, { open: 102, high: 108, low: 101, close: 106, volume: 20 }),
      mk(600, { open: 106, high: 110, low: 104, close: 108, volume: 15 }),
    ];
    const result = resampleIntradayBars(bars, 5);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.time)).toEqual([0, 300, 600]);
  });

  it("버킷 내 다중 바 → OHLC 집계 (open=첫, high=max, low=min, close=마지막), volume=합", () => {
    const bars = [
      mk(0, { open: 100, high: 103, low: 99, close: 101, volume: 10 }),
      mk(60, { open: 101, high: 108, low: 100, close: 105, volume: 20 }),
      mk(120, { open: 105, high: 106, low: 97, close: 104, volume: 30 }),
    ];
    const result = resampleIntradayBars(bars, 5);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(0);
    expect(result[0].open).toBe(100);
    expect(result[0].close).toBe(104);
    expect(result[0].high).toBe(108);
    expect(result[0].low).toBe(97);
    expect(result[0].volume).toBe(60);
  });

  it("버킷 경계 걸침 (time=299 vs 300) → 2개 그룹으로 분할", () => {
    const bars = [
      mk(299, { open: 100, close: 101, volume: 5 }),
      mk(300, { open: 101, close: 102, volume: 5 }),
    ];
    const result = resampleIntradayBars(bars, 5);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(0);
    expect(result[1].time).toBe(300);
  });

  it("volume 전부 undefined → output volume=undefined", () => {
    const bars = [mk(0), mk(60)];
    const result = resampleIntradayBars(bars, 5);
    expect(result[0].volume).toBeUndefined();
  });

  it("일부 바만 volume 존재 → 존재값 합만 출력", () => {
    const bars = [mk(0, { volume: 10 }), mk(60), mk(120, { volume: 20 })];
    const result = resampleIntradayBars(bars, 5);
    expect(result[0].volume).toBe(30);
  });

  it("time이 string인 봉은 스킵 (typeof !== 'number' 가드)", () => {
    const bars = [
      mk("2026-01-01", { open: 100, close: 100 }),
      mk(0, { open: 200, close: 210, volume: 5 }),
    ];
    const result = resampleIntradayBars(bars, 5);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(0);
    expect(result[0].open).toBe(200);
  });

  it("입력 순서 뒤섞임 → 출력은 key 오름차순", () => {
    const bars = [mk(600, { close: 108 }), mk(0, { close: 102 }), mk(300, { close: 106 })];
    const result = resampleIntradayBars(bars, 5);
    expect(result.map((r) => r.time)).toEqual([0, 300, 600]);
  });
});
