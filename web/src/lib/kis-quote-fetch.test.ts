import { describe, it, expect } from "vitest";
import {
  getClosedFallbackAnchors,
  getClosedFallbackMarketDiv,
  mergeAndSortIntradayBars,
  parseDailyMinuteRows,
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
