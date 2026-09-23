import { afterEach, describe, it, expect, vi } from "vitest";
import {
  buildDaySlots,
  callAnchorsWithRetry,
  getClosedFallbackMarketDiv,
  kstToFakeUtcSec,
  mergeAndSortIntradayBars,
  parseDailyMinuteRows,
  parseIndexMinuteRows,
  STOCK_INTRADAY_ANCHORS,
  toKisDate,
} from "./kis-quote-fetch";
import type { ChartBar } from "@/shared/types/quote";
import type { MarketCalendar } from "@/shared/types/marketCalendar";

// ── 당일 fan-out anchor 세트 pin ───────────────────────────────
// FHKST03010230 은 anchor(포함) 이전 실체결 120봉을 반환 → 120 실체결봉은 항상 ≥120분이라
// anchor 간격 ≤120분 · 첫 anchor ≤ 창 시작 + 120분이면 유동성과 무관하게 결손이 없다.
const anchorMin = (a: string) => Number(a.slice(0, 2)) * 60 + Number(a.slice(2, 4));
const maxGap = (anchors: readonly string[]) =>
  Math.max(...anchors.slice(1).map((a, i) => anchorMin(a) - anchorMin(anchors[i])));

// NXT(UN 08:00~20:00) · 비NXT(J 09:00~15:30 + 16:00~20:00) 모두 20:00 에 끝나므로 세트 하나.
describe("STOCK_INTRADAY_ANCHORS", () => {
  it("08:00~20:00 을 6콜로 커버 (애프터 마감 200000 포함)", () => {
    expect(STOCK_INTRADAY_ANCHORS).toEqual([
      "100000",
      "120000",
      "140000",
      "160000",
      "180000",
      "200000",
    ]);
  });

  it("간격 ≤120분 · 첫 anchor 창이 08:50~08:59 무체결 갭을 포함해 08:00 을 덮는다", () => {
    expect(maxGap(STOCK_INTRADAY_ANCHORS)).toBeLessThanOrEqual(120);
    // (08:00, 10:00] 121 슬롯 − 갭 10 = 실체결 ≤111 ≤ 120
    expect(anchorMin(STOCK_INTRADAY_ANCHORS[0]) - 8 * 60 + 1 - 10).toBeLessThanOrEqual(120);
    // 비NXT 는 09:00 이전 봉이 없어 첫 anchor 창이 61분 — 개장 봉 커버는 자명.
    expect(anchorMin(STOCK_INTRADAY_ANCHORS[0]) - 120).toBeLessThanOrEqual(9 * 60);
  });
});

// ── buildDaySlots: 세션 술어(getKrxSessionState) + 갭 창 술어에서 파생 ──
// 시각 리터럴을 여기서 다시 정의하지 않기 위해 슬롯 집합은 두 술어의 교집합이어야 한다.
describe("buildDaySlots", () => {
  const cal: MarketCalendar = { KRX: { "2026-09-11": true, "2026-09-12": false } };
  const hhmm = (sec: number) => {
    const d = new Date(sec * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };
  const LAST = 24 * 60 - 1;

  it("NXT: pre·regular·after 분 − 갭 창 (08:50~08:59 · 15:20~15:29 · 15:31~15:39)", () => {
    const labels = buildDaySlots("2026-09-11", LAST, true, cal).map(hhmm);
    // 08:00~08:49 (50) + 09:00~15:19 (380) + 15:30 (1) + 15:40~19:59 (260)
    expect(labels).toHaveLength(691);
    expect(labels[0]).toBe("0800");
    expect(labels[labels.length - 1]).toBe("1959");
    for (const excluded of ["0759", "0850", "0859", "1520", "1529", "1531", "1539", "2000"]) {
      expect(labels).not.toContain(excluded);
    }
    for (const included of ["0849", "0900", "1519", "1530", "1540"]) {
      expect(labels).toContain(included);
    }
  });

  it("비NXT: regular + KRX 애프터마켓(16:00~) 분 − 갭 창. 15:30~15:59 는 슬롯 밖 (실봉은 pass-through)", () => {
    const labels = buildDaySlots("2026-09-11", LAST, false, cal).map(hhmm);
    // 09:00~15:19 (380) + 16:00~19:59 (240)
    expect(labels).toHaveLength(620);
    expect(labels[0]).toBe("0900");
    expect(labels[labels.length - 1]).toBe("1959");
    for (const excluded of ["0849", "1520", "1529", "1530", "1531", "1547", "1559", "2000"]) {
      expect(labels).not.toContain(excluded);
    }
    for (const included of ["0900", "1519", "1600", "1959"]) {
      expect(labels).toContain(included);
    }
  });

  it("비NXT: 애프터 진입 전 endMin (15:45) → 정규장 슬롯만", () => {
    const labels = buildDaySlots("2026-09-11", 15 * 60 + 45, false, cal).map(hhmm);
    expect(labels[labels.length - 1]).toBe("1519");
  });

  it("endMin 으로 현재 분까지 잘린다", () => {
    const labels = buildDaySlots("2026-09-11", 10 * 60 + 46, true, cal).map(hhmm);
    expect(labels[labels.length - 1]).toBe("1046");
  });

  it("세션 시작 전 endMin (비NXT 08:30) → []", () => {
    expect(buildDaySlots("2026-09-11", 8 * 60 + 30, false, cal)).toEqual([]);
  });

  it("휴장일 → [] (세션 술어가 closed)", () => {
    expect(buildDaySlots("2026-09-12", LAST, true, cal)).toEqual([]);
  });
});

// ── 순수 selectors ────────────────────────────────────────────
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

// ── callAnchorsWithRetry: null anchor 1s 뒤 단발 재시도 · 잔여 null → failed ──
describe("callAnchorsWithRetry", () => {
  const ANCHORS = ["100000", "120000", "140000"] as const;
  // anchor 별 응답 큐 — 호출 순서대로 소비. 큐가 비면 정상 봉.
  const scripted = (script: Record<string, (ChartBar[] | null)[]>) => {
    const calls: Record<string, number> = {};
    const call = vi.fn(async (anchor: string) => {
      calls[anchor] = (calls[anchor] ?? 0) + 1;
      const queue = script[anchor] ?? [];
      return queue.length > 0 ? queue.shift()! : [mk(Number(anchor), 1)];
    });
    return { call, calls };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("전부 성공 → anchor 당 1콜, 재시도 0회, failed:false", async () => {
    const { call, calls } = scripted({});
    const out = await callAnchorsWithRetry(ANCHORS, call, 0);
    expect(out.failed).toBe(false);
    expect(out.results.map((r) => r?.length)).toEqual([1, 1, 1]);
    expect(calls).toEqual({ "100000": 1, "120000": 1, "140000": 1 });
  });

  it("null anchor 재시도 성공 → 그 anchor 만 2콜, failed:false", async () => {
    const { call, calls } = scripted({ "120000": [null] });
    const out = await callAnchorsWithRetry(ANCHORS, call, 0);
    expect(out.failed).toBe(false);
    expect(out.results.every((r) => r !== null)).toBe(true);
    expect(calls).toEqual({ "100000": 1, "120000": 2, "140000": 1 });
  });

  it("재시도도 null → failed:true, 성공 anchor 봉은 그대로 · 재시도는 1회뿐", async () => {
    const { call, calls } = scripted({ "120000": [null, null] });
    const out = await callAnchorsWithRetry(ANCHORS, call, 0);
    expect(out.failed).toBe(true);
    expect(out.results[1]).toBeNull();
    expect(mergeAndSortIntradayBars(out.results).map((b) => b.time)).toEqual([
      100000, 140000,
    ]);
    expect(calls).toEqual({ "100000": 1, "120000": 2, "140000": 1 });
  });

  it("재시도는 기본 1s 지연 뒤 나간다 (즉시 burst 재발 방지)", async () => {
    vi.useFakeTimers();
    const { call, calls } = scripted({ "100000": [null] });
    const pending = callAnchorsWithRetry(ANCHORS, call);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls["100000"]).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const out = await pending;
    expect(calls["100000"]).toBe(2);
    expect(out.failed).toBe(false);
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
    expect(parseDailyMinuteRows([], "20260724", "J")).toEqual([]);
  });

  // 15:40~15:59 fill row 는 J 에서만 갭 — UN 은 NXT 애프터 체결 구간이라 그대로 통과한다.
  it("15:40~15:59 vol=0 fill row: J → 제거 · UN → 보존", () => {
    const rows = [
      row({ stck_cntg_hour: "154500", cntg_vol: 0 }),
      row({ stck_cntg_hour: "160000", cntg_vol: 300 }),
    ];
    expect(parseDailyMinuteRows(rows, "20260724", "J")).toHaveLength(1);
    expect(parseDailyMinuteRows(rows, "20260724", "UN")).toHaveLength(2);
  });

  it("15:47 vol>0 (시간외 종가매매 실체결) → J 에서도 보존", () => {
    const rows = [row({ stck_cntg_hour: "154700", cntg_vol: 120 })];
    expect(parseDailyMinuteRows(rows, "20260724", "J")).toHaveLength(1);
  });

  it("target date 일치 봉만 통과 (저유동성 종목 anchor bleed 방어)", () => {
    // #099-2 실측: 서린바이오 anchor=153000 이 20260723 봉을 함께 반환 → target 필터로 제거.
    const rows = [
      row({ stck_bsop_date: "20260724", stck_cntg_hour: "090000" }),
      row({ stck_bsop_date: "20260723", stck_cntg_hour: "153000" }), // bleed
      row({ stck_bsop_date: "20260724", stck_cntg_hour: "150000" }),
    ];
    const out = parseDailyMinuteRows(rows, "20260724", "J");
    expect(out).toHaveLength(2);
  });

  it("마커 hour (999999 / 888888) 제거", () => {
    const rows = [
      row({ stck_cntg_hour: "999999" }),
      row({ stck_cntg_hour: "888888" }),
      row({ stck_cntg_hour: "150000" }),
    ];
    const out = parseDailyMinuteRows(rows, "20260724", "J");
    expect(out).toHaveLength(1);
  });

  it("sentinel 봉 제거: OHLC 전부 0", () => {
    // 비NXT × UN 확장세션 anchor 실측 패턴 (035720 카카오, #099-5 Step 0)
    const rows = [
      row({ stck_oprc: 0, stck_hgpr: 0, stck_lwpr: 0, stck_prpr: 0, cntg_vol: 0 }),
      row(),
    ];
    const out = parseDailyMinuteRows(rows, "20260724", "J");
    expect(out).toHaveLength(1);
  });

  it("sentinel 봉 제거: 음수 volume (KIS INT64_MIN 문자열 근사값)", () => {
    const coercedInt64Min = Number("-9223372036854775808");
    const rows = [row({ cntg_vol: coercedInt64Min }), row({ cntg_vol: 100 })];
    const out = parseDailyMinuteRows(rows, "20260724", "J");
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
    const out = parseDailyMinuteRows(rows, "20260724", "J");
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
    expect(parseDailyMinuteRows(rows, "20260724", "J")).toEqual([]);
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
