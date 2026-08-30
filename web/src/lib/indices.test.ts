import { describe, it, expect } from "vitest";
import { mergeIntradayBars, toIntradaySnapshots } from "./indices";
import { foldPostCloseIndexBars, kstToFakeUtcSec } from "./kis-quote-fetch";
import type { ChartBar } from "@/shared/types/quote";

const mk = (time: number, close: number): ChartBar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
});

describe("mergeIntradayBars — live 우선 dedup", () => {
  it("빈 입력 → []", () => {
    expect(mergeIntradayBars([], [])).toEqual([]);
  });

  it("DB only → 그대로 (ASC 정렬)", () => {
    const db = [mk(200, 20), mk(100, 10)];
    const result = mergeIntradayBars(db, []);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(100);
    expect(result[1].time).toBe(200);
  });

  it("live only → 그대로 (ASC 정렬)", () => {
    const live = [mk(200, 25), mk(100, 15)];
    const result = mergeIntradayBars([], live);
    expect(result).toHaveLength(2);
    expect(result[0].close).toBe(15);
    expect(result[1].close).toBe(25);
  });

  it("동일 ts 존재 → live 우선 (DB 값 덮어씀)", () => {
    const db = [mk(100, 10), mk(200, 20)];
    const live = [mk(200, 999)]; // 200 ts 겹침
    const result = mergeIntradayBars(db, live);
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe(100);
    expect(result[0].close).toBe(10);
    expect(result[1].time).toBe(200);
    expect(result[1].close).toBe(999); // live 값
  });

  it("DB · live 겹침 없음 → 합집합 (ASC)", () => {
    const db = [mk(100, 10), mk(200, 20)];
    const live = [mk(300, 30), mk(400, 40)];
    const result = mergeIntradayBars(db, live);
    expect(result.map((b) => b.time)).toEqual([100, 200, 300, 400]);
  });

  it("time 이 number 가 아닌 봉 스킵 (방어)", () => {
    const db: ChartBar[] = [
      { time: "2026-07-22", open: 1, high: 1, low: 1, close: 1 },
      mk(100, 10),
    ];
    const result = mergeIntradayBars(db, []);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(100);
  });
});

// ── 서버 파이프라인 (merge → fold, START 라벨 유지) ──
// getIndexIntradayPrices 는 END 라벨/리샘플 없이 fold 결과를 그대로 서빙한다.
describe("국내 지수 서버 파이프라인 (merge → fold)", () => {
  const barSec = (hh: number, mm: number, ss: number = 0): number =>
    kstToFakeUtcSec("20260828", `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}${String(ss).padStart(2, "0")}`);

  it("DB row 인코딩 = 라이브 인코딩: 같은 HHMMSS → 같은 time epoch", () => {
    const dbLike = kstToFakeUtcSec("20260828", "153000");
    const liveLike = kstToFakeUtcSec("20260828", "153000");
    expect(dbLike).toBe(liveLike);
  });

  it("KOSPI 08-28 tail (15:28~15:32) → START 라벨 · 마지막 15:30 · close=6788.88 · vol 7578 · 15:31/32 부재", () => {
    const db: ChartBar[] = [
      { time: barSec(15, 28), open: 6807.9, high: 6807.9, low: 6807.9, close: 6807.9, volume: 0 },
      { time: barSec(15, 29), open: 6807.9, high: 6807.9, low: 6807.9, close: 6807.9, volume: 0 },
      { time: barSec(15, 30), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 7547 },
      { time: barSec(15, 31), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 0 },
      { time: barSec(15, 32), open: 6788.88, high: 6788.88, low: 6788.88, close: 6788.88, volume: 31 },
    ];
    const merged = mergeIntradayBars(db, []);
    const folded = foldPostCloseIndexBars(merged, "153000");
    expect(folded.map((b) => b.time)).toEqual([barSec(15, 28), barSec(15, 29), barSec(15, 30)]);
    const last = folded[folded.length - 1];
    expect(last.time).toBe(barSec(15, 30));
    expect(last.open).toBe(6788.89);
    expect(last.close).toBe(6788.88);
    expect(last.volume).toBe(7547 + 0 + 31); // 7578
    expect(folded.find((b) => b.time === barSec(15, 31))).toBeUndefined();
    expect(folded.find((b) => b.time === barSec(15, 32))).toBeUndefined();
  });

  it("KOSPI200 08-28 tail: 15:31+ 프린트 없음 → fold no-op (START 라벨 유지)", () => {
    const db: ChartBar[] = [
      { time: barSec(15, 29), open: 1069.4, high: 1069.4, low: 1069.4, close: 1069.4, volume: 0 },
      { time: barSec(15, 30), open: 1065.7, high: 1069.5, low: 1065.7, close: 1065.7, volume: 5348 },
    ];
    const merged = mergeIntradayBars(db, []);
    const folded = foldPostCloseIndexBars(merged, "153000");
    expect(folded).toEqual(db);
  });

  it("toIntradaySnapshots: 해외 기본 → volume 0 강제 · 국내 useBarVolume=true → bar.volume 전달", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 30), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.88, volume: 7547 },
    ];
    const overseasOut = toIntradaySnapshots("SPX", bars, 6800);
    expect(overseasOut[0].volume).toBe(0);
    const domesticOut = toIntradaySnapshots("KOSPI", bars, 6800, true);
    expect(domesticOut[0].volume).toBe(7547);
    const noVol: ChartBar[] = [
      { time: barSec(15, 31), open: 1, high: 1, low: 1, close: 1 },
    ];
    expect(toIntradaySnapshots("KOSPI", noVol, 0, true)[0].volume).toBe(0);
  });

  it("live 우선 dedup: 같은 ts 라면 live 값 (fresh) 이 이긴다", () => {
    const t = barSec(15, 30);
    const db: ChartBar[] = [
      { time: t, open: 6800, high: 6800, low: 6800, close: 6800, volume: 100 },
    ];
    const live: ChartBar[] = [
      { time: t, open: 6788, high: 6789, low: 6787, close: 6788.88, volume: 7547 },
    ];
    const merged = mergeIntradayBars(db, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].close).toBe(6788.88);
    expect(merged[0].volume).toBe(7547);
  });
});

// ── 해외 서버 파이프라인 (merge → fold, 리샘플 없음) ──
// 서버는 fold 만 수행하고 END·N분 리샘플은 클라 소관. 결과는 1분 START 라벨 유지.
describe("해외 지수 서버 파이프라인 (merge → fold, 1분 유지)", () => {
  const etBar = (hh: number, mm: number): number =>
    Math.floor(Date.UTC(2026, 7, 28, hh, mm, 0) / 1000);

  it("SPX 15:58~16:03: fold 후 마지막 봉 = 16:00 (16:01~03 흡수) · 1분 유지", () => {
    const db: ChartBar[] = [
      { time: etBar(15, 58), open: 100, high: 100, low: 100, close: 100 },
      { time: etBar(15, 59), open: 101, high: 101, low: 101, close: 101 },
      { time: etBar(16, 0), open: 102, high: 102, low: 102, close: 102 },
      { time: etBar(16, 1), open: 103, high: 103, low: 103, close: 103 },
      { time: etBar(16, 2), open: 104, high: 105, low: 104, close: 104 },
      { time: etBar(16, 3), open: 106, high: 106, low: 100, close: 107 },
    ];
    const merged = mergeIntradayBars(db, []);
    const folded = foldPostCloseIndexBars(merged, "160000");
    // fold 후 timestamp 는 1분 그대로 (15:58, 15:59, 16:00) — 리샘플 없음.
    expect(folded.map((b) => b.time)).toEqual([
      etBar(15, 58),
      etBar(15, 59),
      etBar(16, 0),
    ]);
    const last = folded[folded.length - 1];
    expect(last.open).toBe(102); // 16:00 원래 open
    expect(last.close).toBe(107); // 16:03 close (마지막 봉)
    expect(last.high).toBe(106);
    expect(last.low).toBe(100);
  });
});
