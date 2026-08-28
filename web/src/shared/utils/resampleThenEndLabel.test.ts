import { describe, it, expect } from "vitest";
import type { ChartBar } from "@/shared/types/quote";
import { resampleIntradayBars } from "./resampleIntradayBars";
import { resampleThenEndLabelBySession } from "./resampleThenEndLabelBySession";
import { toEndLabelBars } from "./toEndLabelBars";

// StockChartTabs 파이프라인의 순수 부분 통합 검증:
//   raw START(1분) → resampleThenEndLabelBySession(N분, boundaries) → 표시
//
// 회귀 방지:
//   (a) END 라벨 봉에 floor 리샘플을 걸면 라벨이 붕괴하므로 리샘플→END 순서를 지킨다.
//   (b) floor 버킷이 세션 경계를 걸치면 경계 이후 raw 가 마감 봉에 흡수되므로 세션 분할
//       리샘플로 버킷이 boundary 를 걸치지 않게 한다.
//
// 세션 경계 목록: NXT 프리마켓 마감 08:50 · 정규장 마감 15:30 · NXT 애프터마켓 마감 20:00.

const Y = 2026;
const M = 7; // August (Date.UTC month index)
const D = 28;
const BOUNDARIES: readonly string[] = ["085000", "153000", "200000"];

const sec = (hhmmss: string, day: number = D): number =>
  Math.floor(
    Date.UTC(
      Y,
      M,
      day,
      Number(hhmmss.slice(0, 2)),
      Number(hhmmss.slice(2, 4)),
      Number(hhmmss.slice(4, 6)),
    ) / 1000,
  );

const bar = (
  hhmmss: string,
  ohlc: { o: number; h: number; l: number; c: number },
  v: number,
  day: number = D,
): ChartBar => ({
  time: sec(hhmmss, day),
  open: ohlc.o,
  high: ohlc.h,
  low: ohlc.l,
  close: ohlc.c,
  volume: v,
});

const pipeline = (raw: ChartBar[], minutes: number): ChartBar[] =>
  resampleThenEndLabelBySession(raw, minutes, BOUNDARIES);

// 리샘플→toEndLabelBars 직결 (세션 분할 없음). 버킷이 경계를 걸치지 않는
// 인터벌(1·5·10분)에서 pipeline 과 결과가 일치해야 한다는 불변식 검증용.
const directPipeline = (raw: ChartBar[], minutes: number): ChartBar[] =>
  toEndLabelBars(resampleIntradayBars(raw, minutes), minutes * 60, BOUNDARIES);

describe("resample → toEndLabel 파이프라인 (StockChartTabs 조립)", () => {
  it("5분 첫 봉: 080000~080400 raw START 5개 → 단일 END 08:05 봉", () => {
    const raw: ChartBar[] = [
      bar("080000", { o: 100, h: 102, l: 99, c: 101 }, 10),
      bar("080100", { o: 101, h: 103, l: 100, c: 102 }, 20),
      bar("080200", { o: 102, h: 104, l: 101, c: 103 }, 30),
      bar("080300", { o: 103, h: 105, l: 102, c: 104 }, 40),
      bar("080400", { o: 104, h: 106, l: 103, c: 105 }, 50),
    ];
    const out = pipeline(raw, 5);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(sec("080500"));
    expect(out[0].open).toBe(100);
    expect(out[0].high).toBe(106);
    expect(out[0].low).toBe(99);
    expect(out[0].close).toBe(105);
    expect(out[0].volume).toBe(10 + 20 + 30 + 40 + 50);
  });

  it("5분 형성 중: 084500~084900 raw START 5개 → 단일 END 08:50 봉", () => {
    const raw: ChartBar[] = [
      bar("084500", { o: 260, h: 262, l: 260, c: 261 }, 5),
      bar("084600", { o: 261, h: 263, l: 260, c: 262 }, 6),
      bar("084700", { o: 262, h: 264, l: 261, c: 263 }, 7),
      bar("084800", { o: 263, h: 265, l: 262, c: 264 }, 8),
      bar("084900", { o: 264, h: 266, l: 263, c: 265 }, 9),
    ];
    const out = pipeline(raw, 5);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(sec("085000"));
    expect(out[0].open).toBe(260);
    expect(out[0].close).toBe(265);
    expect(out[0].high).toBe(266);
    expect(out[0].low).toBe(260);
    expect(out[0].volume).toBe(5 + 6 + 7 + 8 + 9);
  });

  it("15분 마감 크로스: 151500~151900 + 153000 raw → 15:15 버킷·15:30 크로스 병합 END 15:30 단일봉 (회귀)", () => {
    // 15:15~15:19 정규 auction (일부 v=0), 15:20~15:29 미거래(응답 부재 가정), 15:30 마감 크로스.
    const raw: ChartBar[] = [
      bar("151500", { o: 300, h: 301, l: 299, c: 300 }, 100),
      bar("151600", { o: 300, h: 302, l: 300, c: 301 }, 120),
      bar("151700", { o: 301, h: 303, l: 300, c: 302 }, 90),
      bar("151800", { o: 302, h: 303, l: 301, c: 302 }, 80),
      bar("151900", { o: 302, h: 304, l: 301, c: 303 }, 70),
      bar("153000", { o: 303, h: 310, l: 303, c: 310 }, 5000),
    ];
    const out = pipeline(raw, 15);
    expect(out).toHaveLength(1);
    // 15:15 버킷(151500~151900) shifted = 15:30 (raw 15:15 다음 경계 15:30, +900 = 15:30 → 클램프 없음)
    // 15:30 봉 shifted = 15:45 > 15:30 → clamp = 15:30
    // 두 봉 shifted=15:30 에서 병합
    expect(out[0].time).toBe(sec("153000"));
    // open = 선행(15:15 버킷)의 open
    expect(out[0].open).toBe(300);
    // close = 후행(15:30 크로스)의 close
    expect(out[0].close).toBe(310);
    expect(out[0].high).toBe(310);
    expect(out[0].low).toBe(299);
    expect(out[0].volume).toBe(100 + 120 + 90 + 80 + 70 + 5000);
  });

  it("1분 회귀: 090000 START 봉 → END 09:01 (리샘플 pass-through)", () => {
    const raw: ChartBar[] = [bar("090000", { o: 100, h: 100, l: 100, c: 100 }, 42)];
    const out = pipeline(raw, 1);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(sec("090100"));
    expect(out[0].close).toBe(100);
    expect(out[0].volume).toBe(42);
  });

  // ── 프리마켓 08:50 · 애프터마켓 20:00 경계 ──

  it("프리 5분 마감: 084500~084900 + 085000(v>0) → END 08:50 병합 1봉", () => {
    // 08:50 은 프리마켓 마감 경계. 08:50 raw 봉이 정규장 09:00 앞에 있으므로
    // shifted 08:55 는 다음 경계 08:50 을 초과 → 08:50 으로 클램프,
    // 08:45 버킷 shifted 도 08:50 → 병합.
    const raw: ChartBar[] = [
      bar("084500", { o: 260, h: 262, l: 260, c: 261 }, 5),
      bar("084600", { o: 261, h: 263, l: 260, c: 262 }, 6),
      bar("084700", { o: 262, h: 264, l: 261, c: 263 }, 7),
      bar("084800", { o: 263, h: 265, l: 262, c: 264 }, 8),
      bar("084900", { o: 264, h: 266, l: 263, c: 265 }, 9),
      bar("085000", { o: 265, h: 268, l: 264, c: 267 }, 500),
    ];
    const out = pipeline(raw, 5);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(sec("085000"));
    // open = 선행(08:45 버킷)의 open, close = 후행(08:50 봉)의 close
    expect(out[0].open).toBe(260);
    expect(out[0].close).toBe(267);
    expect(out[0].high).toBe(268);
    expect(out[0].low).toBe(260);
    expect(out[0].volume).toBe(5 + 6 + 7 + 8 + 9 + 500);
  });

  it("애프터 1분 마감: [195900, 200000] → END 20:00 병합 1봉 (클램프)", () => {
    // 19:59 raw → shifted 20:00 (다음 경계 20:00, 초과 아님 → 그대로 20:00)
    // 20:00 raw → shifted 20:01 > 20:00 → clamp = 20:00
    // 두 봉 병합.
    const raw: ChartBar[] = [
      bar("195900", { o: 500, h: 502, l: 499, c: 501 }, 200),
      bar("200000", { o: 501, h: 505, l: 501, c: 504 }, 800),
    ];
    const out = pipeline(raw, 1);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(sec("200000"));
    expect(out[0].open).toBe(500);
    expect(out[0].close).toBe(504);
    expect(out[0].high).toBe(505);
    expect(out[0].low).toBe(499);
    expect(out[0].volume).toBe(200 + 800);
  });

  it("애프터 5분 마감: 195500~195900 + 200000 → 19:55·20:00 버킷 → END 20:00 병합", () => {
    // 5m 리샘플: 19:55 버킷(19:55~19:59) + 20:00 버킷(20:00).
    // 19:55 shifted = 20:00 (다음 경계 = 20:00). 초과 아님 → 20:00.
    // 20:00 shifted = 20:05 > 20:00 → clamp = 20:00.
    const raw: ChartBar[] = [
      bar("195500", { o: 500, h: 502, l: 499, c: 501 }, 10),
      bar("195600", { o: 501, h: 503, l: 500, c: 502 }, 20),
      bar("195700", { o: 502, h: 504, l: 501, c: 503 }, 30),
      bar("195800", { o: 503, h: 505, l: 502, c: 504 }, 40),
      bar("195900", { o: 504, h: 506, l: 503, c: 505 }, 50),
      bar("200000", { o: 505, h: 510, l: 505, c: 509 }, 1000),
    ];
    const out = pipeline(raw, 5);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(sec("200000"));
    expect(out[0].open).toBe(500);
    expect(out[0].close).toBe(509);
    expect(out[0].high).toBe(510);
    expect(out[0].low).toBe(499);
    expect(out[0].volume).toBe(10 + 20 + 30 + 40 + 50 + 1000);
  });

  // ── 세션 분할 회귀 (KIS 005930 실측 raw 기반) ──
  //
  // KRX 마감(15:30) 이후 KIS UN 응답에 15:20~29·15:31~39 갭 fill 은 upstream 필터 제거,
  // 실체결 15:40~ 시간외 종가매매 봉이 반환. 직결 pipeline 은 floor 15분 버킷 15:30 이
  // raw 15:30·15:40~44 를 함께 담고 clamp 로 END 15:30 에 통째로 흡수한다.
  // 세션 분할은 raw 15:40~44 를 애프터 세그먼트로 옮기고 그 세그먼트 boundary=[20:00]
  // 안에서만 리샘플 → 라벨을 END 15:45 로 이동.

  // 005930 실측 raw (15:20~29·15:31~39 는 upstream 필터로 부재).
  const RAW_005930_1510_1559: ChartBar[] = [
    bar("151000", { o: 256750, h: 257500, l: 256500, c: 257250 }, 156458),
    bar("151100", { o: 257000, h: 257500, l: 257000, c: 257500 }, 42836),
    bar("151200", { o: 257000, h: 257500, l: 257000, c: 257000 }, 42886),
    bar("151300", { o: 257000, h: 257500, l: 257000, c: 257250 }, 46658),
    bar("151400", { o: 257250, h: 257500, l: 257000, c: 257250 }, 51164),
    bar("151500", { o: 257000, h: 258000, l: 257000, c: 257500 }, 92158),
    bar("151600", { o: 257500, h: 258000, l: 257000, c: 257500 }, 93574),
    bar("151700", { o: 257500, h: 258000, l: 257500, c: 257500 }, 63815),
    bar("151800", { o: 257500, h: 258000, l: 257500, c: 257500 }, 50554),
    bar("151900", { o: 257500, h: 259000, l: 257500, c: 258500 }, 144674),
    bar("153000", { o: 257000, h: 257000, l: 257000, c: 257000 }, 1146522),
    bar("154000", { o: 257500, h: 257500, l: 257000, c: 257500 }, 26776),
    bar("154100", { o: 257500, h: 257500, l: 257000, c: 257500 }, 8119),
    bar("154200", { o: 257500, h: 257500, l: 257000, c: 257000 }, 5500),
    bar("154300", { o: 257000, h: 257500, l: 257000, c: 257500 }, 5772),
    bar("154400", { o: 257500, h: 257500, l: 257000, c: 257000 }, 6684),
    bar("154500", { o: 257500, h: 258000, l: 257000, c: 258000 }, 36287),
    bar("154600", { o: 258000, h: 258000, l: 257500, c: 258000 }, 4801),
    bar("154700", { o: 258000, h: 258000, l: 257500, c: 258000 }, 4692),
    bar("154800", { o: 257500, h: 258000, l: 257500, c: 258000 }, 5341),
    bar("154900", { o: 258000, h: 258000, l: 257500, c: 258000 }, 3634),
    bar("155000", { o: 258000, h: 258000, l: 257500, c: 258000 }, 4091),
    bar("155100", { o: 257500, h: 258000, l: 257500, c: 257500 }, 10508),
    bar("155200", { o: 258000, h: 258000, l: 257500, c: 258000 }, 3176),
    bar("155300", { o: 257500, h: 258000, l: 257500, c: 258000 }, 8793),
    bar("155400", { o: 258000, h: 258000, l: 257500, c: 257500 }, 3854),
    bar("155500", { o: 258000, h: 258000, l: 257500, c: 257500 }, 4088),
    bar("155600", { o: 258000, h: 258000, l: 257500, c: 257500 }, 8967),
    bar("155700", { o: 258000, h: 258000, l: 257500, c: 258000 }, 4571),
    bar("155800", { o: 257500, h: 258000, l: 257500, c: 258000 }, 3949),
    bar("155900", { o: 258000, h: 258000, l: 257500, c: 257500 }, 3636),
  ];

  const VOL = (hhmm: string): number => {
    const row = RAW_005930_1510_1559.find(
      (b) => typeof b.time === "number" && new Date((b.time as number) * 1000).toISOString().slice(11, 16) === hhmm,
    );
    if (!row || row.volume === undefined) throw new Error(`no row ${hhmm}`);
    return row.volume;
  };

  const sumRange = (fromHhmm: string, toHhmm: string): number =>
    RAW_005930_1510_1559.filter((b) => {
      if (typeof b.time !== "number") return false;
      const hhmm = new Date(b.time * 1000).toISOString().slice(11, 16);
      return hhmm >= fromHhmm && hhmm <= toHhmm;
    }).reduce((s, b) => s + (b.volume ?? 0), 0);

  it("probe 실측 15분: END 15:30 v=1,591,297 · END 15:45 v=52,851 · END 16:00 = Σraw 15:45~59", () => {
    const out = pipeline(RAW_005930_1510_1559, 15);
    const byTime = new Map(
      out
        .filter((b): b is ChartBar & { time: number } => typeof b.time === "number")
        .map((b) => [b.time, b] as const),
    );
    // END 15:30 = Σraw 15:15~15:19 + 15:30 = 444,775 + 1,146,522
    const end1530 = byTime.get(sec("153000"));
    expect(end1530?.volume).toBe(sumRange("15:15", "15:19") + VOL("15:30"));
    expect(end1530?.volume).toBe(1_591_297);
    // END 15:45 = Σraw 15:40~15:44 (애프터 세그먼트 첫 15분 버킷)
    const end1545 = byTime.get(sec("154500"));
    expect(end1545?.volume).toBe(sumRange("15:40", "15:44"));
    expect(end1545?.volume).toBe(52_851);
    // END 16:00 = Σraw 15:45~15:59
    const end1600 = byTime.get(sec("160000"));
    expect(end1600?.volume).toBe(sumRange("15:45", "15:59"));
  });

  it("probe 실측 30분: END 15:30 = Σraw ≤15:30 · END 16:00 = Σraw 15:40~59", () => {
    const out = pipeline(RAW_005930_1510_1559, 30);
    const byTime = new Map(
      out
        .filter((b): b is ChartBar & { time: number } => typeof b.time === "number")
        .map((b) => [b.time, b] as const),
    );
    // 30분 정규장 세그먼트: bucket 15:00 (raw 15:10~15:19) + bucket 15:30 (raw 15:30) → END 15:30 병합
    const end1530 = byTime.get(sec("153000"));
    expect(end1530?.volume).toBe(sumRange("15:10", "15:19") + VOL("15:30"));
    // 30분 애프터 세그먼트: bucket 15:30 (raw 15:40~15:59) → shift 16:00 → END 16:00
    const end1600 = byTime.get(sec("160000"));
    expect(end1600?.volume).toBe(sumRange("15:40", "15:59"));
  });

  it("probe 실측 60분: END 15:30 = Σraw ≤15:30 · END 16:00 = Σraw 15:40~59", () => {
    const out = pipeline(RAW_005930_1510_1559, 60);
    const byTime = new Map(
      out
        .filter((b): b is ChartBar & { time: number } => typeof b.time === "number")
        .map((b) => [b.time, b] as const),
    );
    // 60분 정규장 세그먼트 bucket 15:00 (raw ≤ 15:30 전량) → clamp END 15:30
    const end1530 = byTime.get(sec("153000"));
    expect(end1530?.volume).toBe(sumRange("15:10", "15:19") + VOL("15:30"));
    // 60분 애프터 세그먼트 bucket 15:00 (raw 15:40~15:59) → shift 16:00 → END 16:00
    const end1600 = byTime.get(sec("160000"));
    expect(end1600?.volume).toBe(sumRange("15:40", "15:59"));
  });

  // ── 1·5·10분: 버킷이 경계 미교차 → 세션 분할이 결과에 영향 없어야 함 ──
  for (const minutes of [1, 5, 10]) {
    it(`${minutes}분: 세션 분할 유틸 === 직결 pipeline`, () => {
      expect(pipeline(RAW_005930_1510_1559, minutes)).toEqual(
        directPipeline(RAW_005930_1510_1559, minutes),
      );
    });
  }

  it("애프터 15분 마감: 194500~195900 + 200000 → END 20:00 병합", () => {
    // 15m 리샘플: 19:45 버킷(19:45~19:59) + 20:00 버킷(20:00).
    // 19:45 shifted = 19:45 + 900 = 20:00 (다음 경계 20:00). 초과 아님 → 20:00.
    // 20:00 shifted = 20:15 > 20:00 → clamp = 20:00.
    const raw: ChartBar[] = [
      bar("194500", { o: 500, h: 502, l: 499, c: 500 }, 1),
      bar("194600", { o: 500, h: 502, l: 499, c: 500 }, 2),
      bar("194700", { o: 500, h: 502, l: 499, c: 500 }, 3),
      bar("194800", { o: 500, h: 502, l: 499, c: 500 }, 4),
      bar("194900", { o: 500, h: 502, l: 499, c: 500 }, 5),
      bar("195000", { o: 500, h: 502, l: 499, c: 500 }, 6),
      bar("195100", { o: 500, h: 502, l: 499, c: 500 }, 7),
      bar("195200", { o: 500, h: 502, l: 499, c: 500 }, 8),
      bar("195300", { o: 500, h: 502, l: 499, c: 500 }, 9),
      bar("195400", { o: 500, h: 502, l: 499, c: 500 }, 10),
      bar("195500", { o: 500, h: 502, l: 499, c: 500 }, 11),
      bar("195600", { o: 500, h: 502, l: 499, c: 500 }, 12),
      bar("195700", { o: 500, h: 502, l: 499, c: 500 }, 13),
      bar("195800", { o: 500, h: 502, l: 499, c: 500 }, 14),
      bar("195900", { o: 500, h: 502, l: 499, c: 505 }, 15),
      bar("200000", { o: 505, h: 512, l: 505, c: 511 }, 2000),
    ];
    const out = pipeline(raw, 15);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe(sec("200000"));
    // open = 선행(19:45 버킷)의 open = 500
    expect(out[0].open).toBe(500);
    // close = 후행(20:00 봉)의 close = 511
    expect(out[0].close).toBe(511);
    expect(out[0].high).toBe(512);
    expect(out[0].low).toBe(499);
    const preSum = 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15;
    expect(out[0].volume).toBe(preSum + 2000);
  });
});
