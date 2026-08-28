import { describe, it, expect } from "vitest";
import {
  foldPostCloseIndexBars,
  getClosedFallbackAnchors,
  getClosedFallbackMarketDiv,
  mergeAndSortIntradayBars,
  parseDailyMinuteRows,
  parseIndexMinuteRows,
  toKisDate,
} from "./kis-quote-fetch";
import { toEndLabelBars } from "@/shared/utils/toEndLabelBars";
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
    expect(foldPostCloseIndexBars([])).toEqual([]);
  });

  it("15:30 이하 봉은 무변경 · 15:30 초과 봉은 그 날짜 15:30 로 재라벨", () => {
    const bars: ChartBar[] = [
      { time: barSec(15, 29), open: 1, high: 1, low: 1, close: 1, volume: 10 },
      { time: barSec(15, 30), open: 2, high: 2, low: 2, close: 2, volume: 20 },
      { time: barSec(15, 31), open: 3, high: 3, low: 3, close: 3, volume: 30 },
      { time: barSec(15, 32), open: 4, high: 4, low: 4, close: 4, volume: 40 },
    ];
    const out = foldPostCloseIndexBars(bars);
    expect(out.map((b) => b.time)).toEqual([
      barSec(15, 29),
      barSec(15, 30),
      barSec(15, 30),
      barSec(15, 30),
    ]);
    // volume/OHLC 는 재라벨만 · 값 유지
    expect(out.map((b) => b.volume)).toEqual([10, 20, 30, 40]);
    expect(out.map((b) => b.close)).toEqual([1, 2, 3, 4]);
  });

  it("KOSPI 실측 패턴: 15:30/15:31/15:32 접기 후 toEndLabelBars → 단일 END 15:30, close=15:32, vol=세 행 합", () => {
    // KIS KOSPI 발행 패턴:
    //   152500~152900: v=0 프리즈 (close=마감 auction 직전 값)
    //   153000: 마감 단일가 실체결
    //   153100: v=0 · close 미변동
    //   153200: 확정 재계산 프린트 (공식 종가, vol 소량)
    const raw: ChartBar[] = [
      { time: barSec(15, 25), open: 6807.9, high: 6807.9, low: 6807.9, close: 6807.9, volume: 0 },
      { time: barSec(15, 30), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 7547 },
      { time: barSec(15, 31), open: 6788.89, high: 6788.89, low: 6788.89, close: 6788.89, volume: 0 },
      { time: barSec(15, 32), open: 6788.88, high: 6788.88, low: 6788.88, close: 6788.88, volume: 31 },
    ];
    const folded = foldPostCloseIndexBars(raw);
    // 10분봉 END 라벨 파이프라인 상응 (지수 서빙 경로).
    const endLabeled = toEndLabelBars(folded, 600, ["153000"]);
    const end1530 = endLabeled.find((b) => b.time === barSec(15, 30));
    expect(end1530).toBeDefined();
    expect(end1530?.close).toBe(6788.88); // 15:32 프린트 = 공식 종가
    expect(end1530?.volume).toBe(7547 + 0 + 31);
  });

  it("KOSPI200 발행 패턴: 15:31+ 프린트 없음 → no-op", () => {
    const raw: ChartBar[] = [
      { time: barSec(15, 29), open: 1065.7, high: 1065.7, low: 1065.7, close: 1065.7, volume: 0 },
      { time: barSec(15, 30), open: 1065.7, high: 1065.7, low: 1065.7, close: 1065.7, volume: 5348 },
    ];
    const folded = foldPostCloseIndexBars(raw);
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
    const out = foldPostCloseIndexBars(bars);
    expect(out[0].time).toBe(prevClose1530);
    expect(out[1].time).toBe(todayClose1530);
  });

  it("time 이 string 인 봉은 pass-through", () => {
    const bars: ChartBar[] = [
      { time: "2026-08-28" as unknown as ChartBar["time"], open: 1, high: 1, low: 1, close: 1 },
    ];
    const out = foldPostCloseIndexBars(bars);
    expect(out).toEqual(bars);
  });
});
