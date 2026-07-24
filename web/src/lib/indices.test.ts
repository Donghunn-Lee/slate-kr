import { describe, it, expect } from "vitest";
import { mergeOverseasIntradayBars } from "./indices";
import type { ChartBar } from "@/shared/types/quote";

const mk = (time: number, close: number): ChartBar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
});

describe("mergeOverseasIntradayBars — live 우선 dedup", () => {
  it("빈 입력 → []", () => {
    expect(mergeOverseasIntradayBars([], [])).toEqual([]);
  });

  it("DB only → 그대로 (ASC 정렬)", () => {
    const db = [mk(200, 20), mk(100, 10)];
    const result = mergeOverseasIntradayBars(db, []);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(100);
    expect(result[1].time).toBe(200);
  });

  it("live only → 그대로 (ASC 정렬)", () => {
    const live = [mk(200, 25), mk(100, 15)];
    const result = mergeOverseasIntradayBars([], live);
    expect(result).toHaveLength(2);
    expect(result[0].close).toBe(15);
    expect(result[1].close).toBe(25);
  });

  it("동일 ts 존재 → live 우선 (DB 값 덮어씀)", () => {
    const db = [mk(100, 10), mk(200, 20)];
    const live = [mk(200, 999)]; // 200 ts 겹침
    const result = mergeOverseasIntradayBars(db, live);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(100);
    expect(result[0].close).toBe(10);
    expect(result[1].time).toBe(200);
    expect(result[1].close).toBe(999); // live 값
  });

  it("DB · live 겹침 없음 → 합집합 (ASC)", () => {
    const db = [mk(100, 10), mk(200, 20)];
    const live = [mk(300, 30), mk(400, 40)];
    const result = mergeOverseasIntradayBars(db, live);
    expect(result.map((b) => b.time)).toEqual([100, 200, 300, 400]);
  });

  it("time 이 number 가 아닌 봉 스킵 (방어)", () => {
    const db: ChartBar[] = [
      { time: "2026-07-22", open: 1, high: 1, low: 1, close: 1 },
      mk(100, 10),
    ];
    const result = mergeOverseasIntradayBars(db, []);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(100);
  });
});
