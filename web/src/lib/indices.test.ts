import { describe, it, expect } from "vitest";
import { foldPostCloseIndexBars, mergeIntradayBars, toIntradaySnapshots } from "./indices";
import { kstToFakeUtcSec } from "./kis-quote-fetch";
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

// ── foldPostCloseIndexBars: 마감 후 확정 재계산 프린트 접기 ──
describe("foldPostCloseIndexBars", () => {
  const Y = 2026;
  const MO = 7; // August
  const DA = 28;
  const barSec = (hh: number, mm: number, ss: number = 0): number =>
    Math.floor(Date.UTC(Y, MO, DA, hh, mm, ss) / 1000);

  it("빈 배열 → []", () => {
    expect(foldPostCloseIndexBars([], "153000")).toEqual([]);
  });

  it("15:30 이하 봉은 무변경 · 15:30 초과 봉은 그 날짜 15:30 봉에 흡수 병합", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 29), open: 1, high: 1, low: 1, close: 1, volume: 10 },
      { time: barSec(15, 30), open: 2, high: 3, low: 2, close: 2, volume: 20 },
      { time: barSec(15, 31), open: 3, high: 3, low: 3, close: 3, volume: 30 },
      { time: barSec(15, 32), open: 4, high: 5, low: 4, close: 4, volume: 40 },
    ];
    const out = foldPostCloseIndexBars(bars, "153000");
    // 15:29 무변경 + 15:30/31/32 병합 → 2봉
    expect(out.map((b) => b.time)).toEqual([barSec(15, 29), barSec(15, 30)]);
    expect(out[0]).toEqual({ time: barSec(15, 29), open: 1, high: 1, low: 1, close: 1, volume: 10 });
    // 병합 규칙: open=선행(15:30) · close=후행(15:32) · H/L 극값 · vol 합
    expect(out[1].open).toBe(2);
    expect(out[1].close).toBe(4);
    expect(out[1].high).toBe(5);
    expect(out[1].low).toBe(2);
    expect(out[1].volume).toBe(20 + 30 + 40);
  });

  it("KOSPI 실측 패턴: fold 결과 15:30 봉 하나에 15:30/31/32 병합 · close=6788.88 · vol=7578", () => {
    // KIS KOSPI 발행 패턴:
    //   153000: 마감 단일가 실체결 (vol 큼)
    //   153100: v=0 · close 미변동
    //   153200: 확정 재계산 프린트 (공식 종가, vol 소량)
    const raw: ChartBar[] = [
      { time: barSec(15, 25), open: 6807.9, high: 6807.9, low: 6807.9, close: 6807.9, volume: 0 },
      { time: barSec(15, 30), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 7547 },
      { time: barSec(15, 31), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 0 },
      { time: barSec(15, 32), open: 6788.88, high: 6788.88, low: 6788.88, close: 6788.88, volume: 31 },
    ];
    const folded = foldPostCloseIndexBars(raw, "153000");
    expect(folded).toHaveLength(2);
    expect(folded[0].time).toBe(barSec(15, 25));
    expect(folded[1].time).toBe(barSec(15, 30));
    expect(folded[1].open).toBe(6788.89);
    expect(folded[1].close).toBe(6788.88);
    expect(folded[1].volume).toBe(7547 + 0 + 31); // 7578
  });

  it("KOSPI200 발행 패턴: 15:31+ 프린트 없음 → no-op", () => {
    const raw: ChartBar[] = [
      { time: barSec(15, 29), open: 1065.7, high: 1065.7, low: 1065.7, close: 1065.7, volume: 0 },
      { time: barSec(15, 30), open: 1065.7, high: 1065.7, low: 1065.7, close: 1065.7, volume: 5348 },
    ];
    const folded = foldPostCloseIndexBars(raw, "153000");
    expect(folded).toEqual(raw);
  });

  it("다일자 봉 — 각 봉 자기 날짜의 15:30 기준으로 재라벨", () => {
    const prevClose1531 = Math.floor(Date.UTC(Y, MO, DA - 1, 15, 31, 0) / 1000);
    const prevClose1530 = Math.floor(Date.UTC(Y, MO, DA - 1, 15, 30, 0) / 1000);
    const todayClose1532 = barSec(15, 32);
    const todayClose1530 = barSec(15, 30);
    const bars: ChartBar[] = [
      { time: prevClose1531, open: 1, high: 1, low: 1, close: 1 },
      { time: todayClose1532, open: 2, high: 2, low: 2, close: 2 },
    ];
    const out = foldPostCloseIndexBars(bars, "153000");
    expect(out[0].time).toBe(prevClose1530);
    expect(out[1].time).toBe(todayClose1530);
  });

  it("time 이 string 인 봉은 pass-through", () => {
    const bars: ChartBar[] = [
      { time: "2026-08-28" as unknown as ChartBar["time"], open: 1, high: 1, low: 1, close: 1 },
    ];
    const out = foldPostCloseIndexBars(bars, "153000");
    expect(out).toEqual(bars);
  });

  // ── 해외 지수 마감 경계 ──
  // 봉 시각은 거래소 로컬 wall-clock 을 Date.UTC 로 위장한 fake-UTC. 경계 판정은
  // getUTC* 컴포넌트로 이뤄지므로 로컬 TZ 상수를 그대로 인코딩해 넣는다.
  it("SPX 16:00 마감 경계 · 마감 후 3봉 (16:01~16:03) → 16:00 봉에 흡수", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 59), open: 1, high: 1, low: 1, close: 1, volume: 0 },
      { time: barSec(16, 0),  open: 2, high: 2, low: 2, close: 2, volume: 0 },
      { time: barSec(16, 1),  open: 3, high: 3, low: 3, close: 3, volume: 0 },
      { time: barSec(16, 2),  open: 4, high: 5, low: 4, close: 4, volume: 0 },
      { time: barSec(16, 3),  open: 6, high: 6, low: 1, close: 7, volume: 0 },
    ];
    const out = foldPostCloseIndexBars(bars, "160000");
    expect(out.map((b) => b.time)).toEqual([barSec(15, 59), barSec(16, 0)]);
    expect(out[1].open).toBe(2);
    expect(out[1].close).toBe(7);
    expect(out[1].high).toBe(6);
    expect(out[1].low).toBe(1);
  });

  it("HSI 16:00 마감 경계 · 마감 후 8봉 → 16:00 봉에 흡수 (실측 개수 정합)", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 59), open: 100, high: 100, low: 100, close: 100 },
      { time: barSec(16, 0),  open: 101, high: 101, low: 101, close: 101 },
    ];
    for (let mm = 1; mm <= 8; mm++) {
      bars.push({ time: barSec(16, mm), open: 100 + mm, high: 100 + mm, low: 100 + mm, close: 100 + mm });
    }
    const out = foldPostCloseIndexBars(bars, "160000");
    expect(out.map((b) => b.time)).toEqual([barSec(15, 59), barSec(16, 0)]);
    expect(out[1].close).toBe(108); // 마지막 봉의 close
  });

  it("NI225 15:30 마감 경계 · 마감 후 1봉 (15:45) → 15:30 봉에 흡수", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 29), open: 60_000, high: 60_000, low: 60_000, close: 60_000 },
      { time: barSec(15, 30), open: 61_000, high: 61_000, low: 61_000, close: 61_000 },
      { time: barSec(15, 45), open: 62_000, high: 62_500, low: 61_500, close: 62_000 },
    ];
    const out = foldPostCloseIndexBars(bars, "153000");
    expect(out.map((b) => b.time)).toEqual([barSec(15, 29), barSec(15, 30)]);
    expect(out[1].open).toBe(61_000);
    expect(out[1].close).toBe(62_000);
    expect(out[1].high).toBe(62_500);
    expect(out[1].low).toBe(61_000);
  });

  it("SHCOMP 15:00 마감 · 마감 후 봉 없음 (실측) → no-op", () => {
    const bars: ChartBar[] = [
      { time: barSec(14, 58), open: 3900, high: 3900, low: 3900, close: 3900 },
      { time: barSec(15, 0),  open: 3910, high: 3910, low: 3910, close: 3910 },
    ];
    const out = foldPostCloseIndexBars(bars, "150000");
    expect(out).toEqual(bars);
  });

  it("DAX 17:30 마감 · 마감 후 봉 없음 (실측) → no-op", () => {
    const bars: ChartBar[] = [
      { time: barSec(17, 29), open: 26_500, high: 26_500, low: 26_500, close: 26_500 },
      { time: barSec(17, 30), open: 26_583, high: 26_583, low: 26_583, close: 26_583 },
    ];
    const out = foldPostCloseIndexBars(bars, "173000");
    expect(out).toEqual(bars);
  });
});
