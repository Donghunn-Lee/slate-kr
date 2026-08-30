import { describe, it, expect } from "vitest";
import {
  foldPostCloseIndexBars,
  getClosedFallbackAnchors,
  getClosedFallbackMarketDiv,
  kstToFakeUtcSec,
  mergeAndSortIntradayBars,
  parseDailyMinuteRows,
  parseIndexMinuteRows,
  toKisDate,
} from "./kis-quote-fetch";
import type { ChartBar } from "@/shared/types/quote";

// ── 순수 selectors ────────────────────────────────────────────
describe("getClosedFallbackAnchors", () => {
  it("NXT 종목 → 08:00~20:00 커버용 7개 anchor (프리 090000 + 애프터 200000 포함)", () => {
    const anchors = getClosedFallbackAnchors(true);
    expect(anchors).toEqual([
      "090000",
      "110000",
      "130000",
      "150000",
      "170000",
      "190000",
      "200000",
    ]);
  });

  it("비NXT 종목 → 09:00~15:30 커버용 3개 anchor (마감 153000 포함)", () => {
    const anchors = getClosedFallbackAnchors(false);
    expect(anchors).toEqual(["110000", "130000", "153000"]);
  });
});

describe("getClosedFallbackMarketDiv", () => {
  it("NXT → UN (KRX+NXT 통합, 확장세션 봉 반환)", () => {
    expect(getClosedFallbackMarketDiv(true)).toBe("UN");
  });
  it("비NXT → J (정규장 KRX only)", () => {
    // 실측: 비NXT + UN 조합은 확장세션에서 sentinel/무관 date 반환 (#099-5 Step 0)
    expect(getClosedFallbackMarketDiv(false)).toBe("J");
  });
});

describe("toKisDate", () => {
  it("YYYY-MM-DD → YYYYMMDD", () => {
    expect(toKisDate("2026-07-24")).toBe("20260724");
  });
  it("이미 대시 없으면 그대로", () => {
    expect(toKisDate("20260724")).toBe("20260724");
  });
});

// ── mergeAndSortIntradayBars ─────────────────────────────────
const mk = (time: number, close: number): ChartBar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 100,
});

describe("mergeAndSortIntradayBars", () => {
  it("빈 입력 → []", () => {
    expect(mergeAndSortIntradayBars([])).toEqual([]);
  });

  it("모두 null → []", () => {
    expect(mergeAndSortIntradayBars([null, null, null])).toEqual([]);
  });

  it("단일 배치 → 그대로 (ASC 정렬)", () => {
    const result = mergeAndSortIntradayBars([[mk(200, 20), mk(100, 10), mk(150, 15)]]);
    expect(result.map((b) => b.time)).toEqual([100, 150, 200]);
  });

  it("여러 anchor 겹침 → time 기준 dedup, 마지막 배치 우선", () => {
    const a = [mk(100, 10), mk(200, 20)];
    const b = [mk(200, 999), mk(300, 30)]; // 200 겹침
    const result = mergeAndSortIntradayBars([a, b]);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ time: 100, close: 10 });
    expect(result[1]).toMatchObject({ time: 200, close: 999 }); // b 우선
    expect(result[2]).toMatchObject({ time: 300, close: 30 });
  });

  it("null 배치 · 정상 배치 혼재 → null 스킵", () => {
    const result = mergeAndSortIntradayBars([null, [mk(100, 10)], null, [mk(200, 20)]]);
    expect(result.map((b) => b.time)).toEqual([100, 200]);
  });

  it("time 이 number 가 아닌 봉 스킵 (방어)", () => {
    const bars: ChartBar[] = [
      { time: "2026-07-22", open: 1, high: 1, low: 1, close: 1 },
      mk(100, 10),
    ];
    const result = mergeAndSortIntradayBars([bars]);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(100);
  });
});

// ── parseDailyMinuteRows: target 필터 + sentinel 필터 + 마커 제거 ─
type Row = Parameters<typeof parseDailyMinuteRows>[0][number];

const row = (over: Partial<Row> = {}): Row => ({
  stck_bsop_date: "20260724",
  stck_cntg_hour: "100000",
  stck_prpr: 100,
  stck_oprc: 100,
  stck_hgpr: 101,
  stck_lwpr: 99,
  cntg_vol: 500,
  ...over,
});

describe("parseDailyMinuteRows", () => {
  it("빈 입력 → []", () => {
    expect(parseDailyMinuteRows([], "20260724")).toEqual([]);
  });

  it("target date 일치 봉만 통과 (저유동성 종목 anchor bleed 방어)", () => {
    // #099-2 실측: 서린바이오 anchor=153000 이 20260723 봉을 함께 반환 → target 필터로 제거.
    const rows = [
      row({ stck_bsop_date: "20260724", stck_cntg_hour: "090000" }),
      row({ stck_bsop_date: "20260723", stck_cntg_hour: "153000" }), // bleed
      row({ stck_bsop_date: "20260724", stck_cntg_hour: "150000" }),
    ];
    const out = parseDailyMinuteRows(rows, "20260724");
    expect(out).toHaveLength(2);
  });

  it("마커 hour (999999 / 888888) 제거", () => {
    const rows = [
      row({ stck_cntg_hour: "999999" }),
      row({ stck_cntg_hour: "888888" }),
      row({ stck_cntg_hour: "150000" }),
    ];
    const out = parseDailyMinuteRows(rows, "20260724");
    expect(out).toHaveLength(1);
  });

  it("sentinel 봉 제거: OHLC 전부 0", () => {
    // 비NXT × UN 확장세션 anchor 실측 패턴 (035720 카카오, #099-5 Step 0)
    const rows = [
      row({ stck_oprc: 0, stck_hgpr: 0, stck_lwpr: 0, stck_prpr: 0, cntg_vol: 0 }),
      row(),
    ];
    const out = parseDailyMinuteRows(rows, "20260724");
    expect(out).toHaveLength(1);
  });

  it("sentinel 봉 제거: 음수 volume (KIS INT64_MIN 문자열 근사값)", () => {
    const coercedInt64Min = Number("-9223372036854775808");
    const rows = [row({ cntg_vol: coercedInt64Min }), row({ cntg_vol: 100 })];
    const out = parseDailyMinuteRows(rows, "20260724");
    expect(out).toHaveLength(1);
  });

  it("정상 봉 → ChartBar 매핑 (KST → fake-UTC 초, prpr → close)", () => {
    const rows = [
      row({
        stck_bsop_date: "20260724",
        stck_cntg_hour: "153000",
        stck_prpr: 252250,
        stck_oprc: 252250,
        stck_hgpr: 252500,
        stck_lwpr: 252000,
        cntg_vol: 5930,
      }),
    ];
    const out = parseDailyMinuteRows(rows, "20260724");
    expect(out).toHaveLength(1);
    // 2026-07-24 15:30:00 KST → Date.UTC(2026, 6, 24, 15, 30, 0) / 1000
    const expectedTime = Date.UTC(2026, 6, 24, 15, 30, 0) / 1000;
    expect(out[0]).toEqual({
      time: expectedTime,
      open: 252250,
      high: 252500,
      low: 252000,
      close: 252250,
      volume: 5930,
    });
  });

  it("전 봉 sentinel → [] (비NXT × UN 확장세션 전형 케이스)", () => {
    const rows = Array.from({ length: 30 }, () =>
      row({ stck_oprc: 0, stck_hgpr: 0, stck_lwpr: 0, stck_prpr: 0, cntg_vol: -1 }),
    );
    expect(parseDailyMinuteRows(rows, "20260724")).toEqual([]);
  });
});

// ── parseIndexMinuteRows: closed 경로 target 필터 · 라이브 경로 pass-through ──
type IndexRow = Parameters<typeof parseIndexMinuteRows>[0][number];

const iRow = (over: Partial<IndexRow> = {}): IndexRow => ({
  stck_bsop_date: "20260724",
  stck_cntg_hour: "100000",
  bstp_nmix_prpr: 6510.5,
  bstp_nmix_oprc: 6500,
  bstp_nmix_hgpr: 6520,
  bstp_nmix_lwpr: 6495,
  cntg_vol: 1000,
  ...over,
});

describe("parseIndexMinuteRows", () => {
  it("빈 입력 → []", () => {
    expect(parseIndexMinuteRows([], "20260724")).toEqual([]);
    expect(parseIndexMinuteRows([], null)).toEqual([]);
  });

  it("target 지정 → 해당 date 봉만 통과 (bleed 방어)", () => {
    // FID_INPUT_DATE_1 응답이 target 전후일 봉을 함께 반환하는 관측을 재현.
    const rows = [
      iRow({ stck_bsop_date: "20260723", stck_cntg_hour: "153000" }),
      iRow({ stck_bsop_date: "20260724", stck_cntg_hour: "090000" }),
      iRow({ stck_bsop_date: "20260724", stck_cntg_hour: "153000" }),
      iRow({ stck_bsop_date: "20260727", stck_cntg_hour: "090000" }),
    ];
    const out = parseIndexMinuteRows(rows, "20260724");
    expect(out).toHaveLength(2);
    expect(out[0].timestamp).toBeLessThan(out[1].timestamp);
  });

  it("target=null → date 필터 스킵 (라이브 경로 · 기존 동작)", () => {
    const rows = [
      iRow({ stck_bsop_date: "20260723" }),
      iRow({ stck_bsop_date: "20260724" }),
      iRow({ stck_bsop_date: "20260727" }),
    ];
    expect(parseIndexMinuteRows(rows, null)).toHaveLength(3);
  });

  it("마커 hour 제거 (999999 / 888888)", () => {
    const rows = [
      iRow({ stck_cntg_hour: "999999" }),
      iRow({ stck_cntg_hour: "888888" }),
      iRow({ stck_cntg_hour: "100000" }),
    ];
    expect(parseIndexMinuteRows(rows, "20260724")).toHaveLength(1);
  });

  it("bstp_nmix_* → open/high/low/close 매핑 + KST fake-UTC 초 변환", () => {
    const rows = [
      iRow({
        stck_bsop_date: "20260724",
        stck_cntg_hour: "153000",
        bstp_nmix_prpr: 6534.55,
        bstp_nmix_oprc: 6533,
        bstp_nmix_hgpr: 6540,
        bstp_nmix_lwpr: 6530,
        cntg_vol: 12345,
      }),
    ];
    const out = parseIndexMinuteRows(rows, "20260724");
    expect(out).toHaveLength(1);
    const expectedTs = Date.UTC(2026, 6, 24, 15, 30, 0) / 1000;
    expect(out[0]).toEqual({
      timestamp: expectedTs,
      open: 6533,
      high: 6540,
      low: 6530,
      close: 6534.55,
      volume: 12345,
    });
  });

  it("정렬 안 된 입력 → ASC 정렬 결과", () => {
    const rows = [
      iRow({ stck_bsop_date: "20260724", stck_cntg_hour: "153000" }),
      iRow({ stck_bsop_date: "20260724", stck_cntg_hour: "090000" }),
      iRow({ stck_bsop_date: "20260724", stck_cntg_hour: "120000" }),
    ];
    const out = parseIndexMinuteRows(rows, "20260724");
    expect(out.map((b) => b.timestamp)).toEqual(
      [...out.map((b) => b.timestamp)].sort((a, b) => a - b),
    );
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

// ── kstToFakeUtcSec: 라이브·DB 인코딩 정합 검증 ──
// 같은 (YYYYMMDD,HHMMSS) → 같은 epoch 초 규약. parseIndexMinuteRows 산출과 동일 값 확인.
describe("kstToFakeUtcSec — export & Date.UTC 인코딩", () => {
  it("Date.UTC 트릭 그대로 (KST 벽시계 → fake-UTC 초)", () => {
    expect(kstToFakeUtcSec("20260828", "153000")).toBe(
      Math.floor(Date.UTC(2026, 7, 28, 15, 30, 0) / 1000),
    );
  });

  it("parseIndexMinuteRows 산출 timestamp 와 동일 값", () => {
    const rows = [
      {
        stck_bsop_date: "20260828",
        stck_cntg_hour: "153000",
        bstp_nmix_prpr: 6788.89,
        bstp_nmix_oprc: 6788.89,
        bstp_nmix_hgpr: 6788.89,
        bstp_nmix_lwpr: 6788.89,
        cntg_vol: 7547,
      },
    ];
    const out = parseIndexMinuteRows(rows, "20260828");
    expect(out[0].timestamp).toBe(kstToFakeUtcSec("20260828", "153000"));
  });
});
