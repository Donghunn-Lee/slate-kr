import { describe, it, expect } from "vitest";
import { toIndexDisplayBars } from "./toIndexDisplayBars";
import type { ChartBar, IndexIntradaySnapshot } from "@/shared/types/quote";

// timestamp fake-UTC 인코딩: Date.UTC 로 KST 벽시계 위장.
const ts = (hh: number, mm: number): number =>
  Math.floor(Date.UTC(2026, 7, 28, hh, mm, 0) / 1000);

const snap = (
  hh: number,
  mm: number,
  overrides: Partial<IndexIntradaySnapshot> = {},
): IndexIntradaySnapshot => ({
  indexCode: "KOSPI",
  timestamp: ts(hh, mm),
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  change: 0,
  changeRate: 0,
  volume: 10,
  ...overrides,
});

// 서버 fold 결과와 동형인 15:00~15:30 fixture. 각 분마다 close 를 증가시켜
// 리샘플·END 라벨 이동 후 마지막 close 가 후행 bucket 의 마지막 값이 되도록 한다.
// 15:30 은 fold 결과의 병합 봉 (close 6788.88, vol 7578) 를 그대로 사용.
const KOSPI_1500_1530_FIXTURE: IndexIntradaySnapshot[] = [
  snap(15, 0, { close: 6810, volume: 100 }),
  snap(15, 1, { close: 6811, volume: 110 }),
  snap(15, 2, { close: 6812, volume: 120 }),
  snap(15, 3, { close: 6813, volume: 130 }),
  snap(15, 4, { close: 6814, volume: 140 }),
  snap(15, 5, { close: 6815, volume: 150 }),
  snap(15, 6, { close: 6816, volume: 160 }),
  snap(15, 7, { close: 6817, volume: 170 }),
  snap(15, 8, { close: 6818, volume: 180 }),
  snap(15, 9, { close: 6819, volume: 190 }),
  snap(15, 10, { close: 6820, volume: 200 }),
  snap(15, 11, { close: 6821, volume: 210 }),
  snap(15, 12, { close: 6822, volume: 220 }),
  snap(15, 13, { close: 6823, volume: 230 }),
  snap(15, 14, { close: 6824, volume: 240 }),
  snap(15, 15, { close: 6825, volume: 250 }),
  snap(15, 16, { close: 6826, volume: 260 }),
  snap(15, 17, { close: 6827, volume: 270 }),
  snap(15, 18, { close: 6828, volume: 280 }),
  snap(15, 19, { close: 6829, volume: 290 }),
  snap(15, 20, { close: 6830, volume: 300 }),
  snap(15, 21, { close: 6831, volume: 310 }),
  snap(15, 22, { close: 6832, volume: 320 }),
  snap(15, 23, { close: 6833, volume: 330 }),
  snap(15, 24, { close: 6834, volume: 340 }),
  snap(15, 25, { close: 6835, volume: 350 }),
  snap(15, 26, { close: 6836, volume: 360 }),
  snap(15, 27, { close: 6837, volume: 370 }),
  snap(15, 28, { close: 6838, volume: 380 }),
  snap(15, 29, { close: 6839, volume: 390 }),
  snap(15, 30, {
    open: 6788.89,
    high: 6788.89,
    low: 6788.88,
    close: 6788.88,
    volume: 7578,
  }),
];

const sumVolBetween = (
  from: number,
  toExclusive: number,
): number =>
  KOSPI_1500_1530_FIXTURE.filter(
    (s) => s.timestamp >= from && s.timestamp < toExclusive,
  ).reduce((sum, s) => sum + s.volume, 0);

describe("toIndexDisplayBars", () => {
  it("빈 입력 → []", () => {
    expect(toIndexDisplayBars([], 1, "KOSPI")).toEqual([]);
    expect(toIndexDisplayBars([], 5, "KOSPI")).toEqual([]);
    expect(toIndexDisplayBars([], 15, "KOSPI")).toEqual([]);
  });

  it("1분: 리샘플 pass-through, END(60) 라벨만 시프트. 15:29 → 15:30, 마지막 15:30 → END 15:30 (병합)", () => {
    const out = toIndexDisplayBars(KOSPI_1500_1530_FIXTURE, 1, "KOSPI");
    // 15:00~15:29 각 봉이 +60 시프트 → END 15:01~15:30. 마지막 15:30 은 경계 clamp = END 15:30.
    // 15:29 shifted = 15:30 · 15:30 shifted+clamp = 15:30 → 두 봉 END 15:30 병합.
    // 결과: END 15:01..15:29 (29봉) + END 15:30 (병합 봉).
    const times = out.map((b) => b.time);
    expect(times[0]).toBe(ts(15, 1));
    expect(times[times.length - 1]).toBe(ts(15, 30));
    expect(out).toHaveLength(30);
    const end1530 = out[out.length - 1];
    // 병합: open=raw 15:29 open, close=raw 15:30 close, H/L 극값, vol 합.
    expect(end1530.close).toBe(6788.88);
    expect(end1530.volume).toBe(390 + 7578);
  });

  it("5분: 15:15~15:19 버킷 · 15:30 fold 봉 → END 15:20/25/30 등", () => {
    const out = toIndexDisplayBars(KOSPI_1500_1530_FIXTURE, 5, "KOSPI");
    // 5분 리샘플 버킷 (fake-UTC epoch 초의 5분=300 flooring):
    //   15:00~15:04 → 15:00, 15:05~09 → 15:05, ..., 15:25~29 → 15:25, 15:30 → 15:30.
    // 각 버킷 shifted = +300 → END 15:05, 15:10, ..., 15:30, 15:35.
    // 마지막 15:30 버킷은 shifted 15:35 > 경계 15:30 → clamp = END 15:30.
    // 15:25 버킷 shifted = 15:30 (경계 이하 무클램프) → END 15:30 병합.
    const byTime = new Map<number, ChartBar>();
    for (const b of out) {
      if (typeof b.time === "number") byTime.set(b.time, b);
    }
    expect(byTime.has(ts(15, 30))).toBe(true);
    const end1530 = byTime.get(ts(15, 30))!;
    // close: 마지막 fold 봉 (15:30 하나짜리 버킷) 의 close.
    expect(end1530.close).toBe(6788.88);
    // vol: 15:25~15:29 버킷 (5봉) + 15:30 버킷 (fold 봉 7578).
    expect(end1530.volume).toBe(sumVolBetween(ts(15, 25), ts(15, 30)) + 7578);
  });

  it("15분: END 15:15 봉 = raw 15:00~14 · END 15:30 봉 = raw 15:15~29 + fold 15:30", () => {
    const out = toIndexDisplayBars(KOSPI_1500_1530_FIXTURE, 15, "KOSPI");
    const byTime = new Map<number, ChartBar>();
    for (const b of out) {
      if (typeof b.time === "number") byTime.set(b.time, b);
    }
    const end1515 = byTime.get(ts(15, 15));
    expect(end1515).toBeDefined();
    expect(end1515?.volume).toBe(sumVolBetween(ts(15, 0), ts(15, 15)));
    const end1530 = byTime.get(ts(15, 30));
    expect(end1530).toBeDefined();
    expect(end1530?.close).toBe(6788.88);
    expect(end1530?.volume).toBe(sumVolBetween(ts(15, 15), ts(15, 30)) + 7578);
  });
});

// 해외 지수는 code 인자로 마감 경계(HHMMSS)를 파생. 아래 fixture 는 서버 fold 결과
// 와 동형인 close-경계 근접 몇 분치 봉.
const overseasSnap = (
  code: IndexIntradaySnapshot["indexCode"],
  d: number,
  hh: number,
  mm: number,
  close: number,
): IndexIntradaySnapshot => ({
  indexCode: code,
  timestamp: Math.floor(Date.UTC(2026, 7, d, hh, mm, 0) / 1000),
  open: close,
  high: close,
  low: close,
  close,
  change: 0,
  changeRate: 0,
  volume: 0,
});

describe("toIndexDisplayBars — overseas (code 별 마감 경계)", () => {
  it("SPX 1분: 마지막 라벨 = END 16:00 (fold 봉이 clamp), 그 이후 봉 없음", () => {
    const snaps = [
      overseasSnap("SPX", 28, 15, 58, 7715),
      overseasSnap("SPX", 28, 15, 59, 7714),
      overseasSnap("SPX", 28, 16, 0, 7711.76),
    ];
    const out = toIndexDisplayBars(snaps, 1, "SPX");
    const last = out[out.length - 1];
    expect(last.time).toBe(Math.floor(Date.UTC(2026, 7, 28, 16, 0, 0) / 1000));
    expect(last.close).toBe(7711.76);
  });

  it("SPX 5분: 마지막 5분 버킷이 END 16:00 으로 clamp", () => {
    const snaps: IndexIntradaySnapshot[] = [];
    for (let m = 55; m < 60; m++) snaps.push(overseasSnap("SPX", 28, 15, m, 7710 + m));
    snaps.push(overseasSnap("SPX", 28, 16, 0, 7711.76));
    const out = toIndexDisplayBars(snaps, 5, "SPX");
    const last = out[out.length - 1];
    expect(last.time).toBe(Math.floor(Date.UTC(2026, 7, 28, 16, 0, 0) / 1000));
    expect(last.close).toBe(7711.76);
  });

  it("SPX 15분: 마지막 15분 버킷이 END 16:00 으로 clamp", () => {
    const snaps: IndexIntradaySnapshot[] = [];
    for (let m = 45; m < 60; m++) snaps.push(overseasSnap("SPX", 28, 15, m, 7710 + m));
    snaps.push(overseasSnap("SPX", 28, 16, 0, 7711.76));
    const out = toIndexDisplayBars(snaps, 15, "SPX");
    const last = out[out.length - 1];
    expect(last.time).toBe(Math.floor(Date.UTC(2026, 7, 28, 16, 0, 0) / 1000));
    expect(last.close).toBe(7711.76);
  });

  it("NI225 15분: 마지막 라벨 = END 15:30 (KOSPI 와 같지만 code 파생)", () => {
    const snaps: IndexIntradaySnapshot[] = [];
    for (let m = 15; m < 30; m++) snaps.push(overseasSnap("NI225", 28, 15, m, 66000 + m));
    snaps.push(overseasSnap("NI225", 28, 15, 30, 66405.56));
    const out = toIndexDisplayBars(snaps, 15, "NI225");
    const last = out[out.length - 1];
    expect(last.time).toBe(Math.floor(Date.UTC(2026, 7, 28, 15, 30, 0) / 1000));
    expect(last.close).toBe(66405.56);
  });

  it("2세션 입력 (prev + today) → 각 세션 마감 봉 각각 END 라벨 적용", () => {
    // 27일 15:58, 15:59, 16:00 (prev close) + 28일 15:58, 15:59, 16:00 (today close).
    const snaps: IndexIntradaySnapshot[] = [
      overseasSnap("SPX", 27, 15, 58, 100),
      overseasSnap("SPX", 27, 15, 59, 101),
      overseasSnap("SPX", 27, 16, 0, 102),
      overseasSnap("SPX", 28, 15, 58, 200),
      overseasSnap("SPX", 28, 15, 59, 201),
      overseasSnap("SPX", 28, 16, 0, 202),
    ];
    const out = toIndexDisplayBars(snaps, 1, "SPX");
    const prev1600 = out.find(
      (b) => b.time === Math.floor(Date.UTC(2026, 7, 27, 16, 0, 0) / 1000),
    );
    const today1600 = out.find(
      (b) => b.time === Math.floor(Date.UTC(2026, 7, 28, 16, 0, 0) / 1000),
    );
    expect(prev1600).toBeDefined();
    expect(today1600).toBeDefined();
    expect(prev1600?.close).toBe(102);
    expect(today1600?.close).toBe(202);
  });
});
