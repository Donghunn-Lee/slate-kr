import { describe, it, expect } from "vitest";
import { mergeIntradayBars, toIntradaySnapshots } from "./indices";
import {
  INDEX_END_LABEL_BOUNDARIES,
  foldPostCloseIndexBars,
  kstToFakeUtcSec,
} from "./kis-quote-fetch";
import { toEndLabelBars } from "@/shared/utils/toEndLabelBars";
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

// ── 국내 1분 파이프라인 ──
// DB read + KIS live tail 병합 후 fold → END(60, ["153000"]) 파이프라인 순수 검증.
describe("국내 1분 파이프라인 (merge → fold → END)", () => {
  const barSec = (hh: number, mm: number, ss: number = 0): number =>
    kstToFakeUtcSec("20260828", `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}${String(ss).padStart(2, "0")}`);

  it("DB row 인코딩 = 라이브 인코딩: 같은 HHMMSS → 같은 time epoch", () => {
    const dbLike = kstToFakeUtcSec("20260828", "153000");
    const liveLike = kstToFakeUtcSec("20260828", "153000");
    expect(dbLike).toBe(liveLike);
  });

  it("KOSPI 08-28 tail (15:28~15:32) → END 15:30 단일 · close=6788.88 · vol=15:29+7547+0+31", () => {
    // fixture — DB tail (15:28~15:32) 실측값. KOSPI 15:31/15:32 프린트 포함.
    // 15:25~15:27 은 v=0 프리즈, tail 하한을 15:28 로 압축 (테스트 필수치만).
    const db: ChartBar[] = [
      { time: barSec(15, 28), open: 6807.9, high: 6807.9, low: 6807.9, close: 6807.9, volume: 0 },
      { time: barSec(15, 29), open: 6807.9, high: 6807.9, low: 6807.9, close: 6807.9, volume: 0 },
      { time: barSec(15, 30), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 7547 },
      { time: barSec(15, 31), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 0 },
      { time: barSec(15, 32), open: 6788.88, high: 6788.88, low: 6788.88, close: 6788.88, volume: 31 },
    ];
    const merged = mergeIntradayBars(db, []);
    const folded = foldPostCloseIndexBars(merged);
    const out = toEndLabelBars(folded, 60, INDEX_END_LABEL_BOUNDARIES);
    // 예상: 15:28→15:29 END, 15:29→15:30 END(15:30 fold 봉과 병합), 15:30/31/32 fold→15:30 END.
    // 결국 END-labeled 봉:
    //   15:29 (raw 15:28 shifted +60)
    //   15:30 (raw 15:29 shifted + raw 15:30/31/32 fold 통합)
    expect(out).toHaveLength(2);
    const end1529 = out.find((b) => b.time === barSec(15, 29));
    expect(end1529).toBeDefined();
    const end1530 = out.find((b) => b.time === barSec(15, 30));
    expect(end1530).toBeDefined();
    expect(end1530?.close).toBe(6788.88); // 15:32 프린트 = 공식 종가
    expect(end1530?.volume).toBe(0 + 7547 + 0 + 31); // 15:29 (0) + 15:30/31/32 실값
    // 15:31/15:32 END-labeled 봉은 존재하지 않아야 함.
    expect(out.find((b) => b.time === barSec(15, 31))).toBeUndefined();
    expect(out.find((b) => b.time === barSec(15, 32))).toBeUndefined();
  });

  it("KOSPI200 08-28 tail: 15:31+ 프린트 없음 → END 15:30 단일", () => {
    const db: ChartBar[] = [
      { time: barSec(15, 29), open: 1069.4, high: 1069.4, low: 1069.4, close: 1069.4, volume: 0 },
      { time: barSec(15, 30), open: 1065.7, high: 1069.5, low: 1065.7, close: 1065.7, volume: 5348 },
    ];
    const merged = mergeIntradayBars(db, []);
    const folded = foldPostCloseIndexBars(merged);
    const out = toEndLabelBars(folded, 60, INDEX_END_LABEL_BOUNDARIES);
    // 15:29 → END 15:30 · 15:30 → END 15:30 (경계 clamp) → 병합.
    const end1530 = out.find((b) => b.time === barSec(15, 30));
    expect(end1530).toBeDefined();
    expect(end1530?.close).toBe(1065.7);
    expect(end1530?.volume).toBe(0 + 5348);
    expect(out).toHaveLength(1);
  });

  it("toIntradaySnapshots: 해외 기본 → volume 0 강제 · 국내 useBarVolume=true → bar.volume 전달", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 30), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.88, volume: 7547 },
    ];
    const overseasOut = toIntradaySnapshots("SPX", bars, 6800);
    expect(overseasOut[0].volume).toBe(0);
    const domesticOut = toIntradaySnapshots("KOSPI", bars, 6800, true);
    expect(domesticOut[0].volume).toBe(7547);
    // volume 미정의 봉은 국내 경로에서도 0 로 안전.
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
