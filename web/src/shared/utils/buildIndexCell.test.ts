import { describe, it, expect } from "vitest";
import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
  IndexQuote,
} from "@/shared/types/quote";
import type { IndexCellData } from "@/features/index-quotes/useIndexQuotes";
import { buildIndexCell } from "./buildIndexCell";

const daily = (over: Partial<IndexDailySnapshot> = {}): IndexDailySnapshot => ({
  indexCode: "SPX",
  date: "2026-07-28",
  open: 5000,
  high: 5050,
  low: 4980,
  close: 5030,
  change: 12,
  changeRate: 0.24,
  ...over,
});

const bar = (over: Partial<IndexIntradaySnapshot> = {}): IndexIntradaySnapshot => ({
  indexCode: "SPX",
  timestamp: 1_722_180_000,
  open: 5030,
  high: 5060,
  low: 5025,
  close: 5055,
  change: 25,
  changeRate: 0.5,
  volume: 0,
  ...over,
});

const domesticCell = (
  over: Partial<IndexCellData["live"]> = {},
): IndexCellData => ({
  live: {
    name: "코스피",
    price: 2800,
    change: 10,
    changeRate: 0.36,
    sign: "up",
    open: 2790,
    high: 2810,
    low: 2785,
    advCount: 500,
    declCount: 400,
    time: null,
    ...over,
  },
  fallback: null,
});

const overseasQuote = (over: Partial<IndexQuote> = {}): IndexQuote => ({
  name: "S&P 500",
  price: 7691.76,
  change: -53.3,
  changeRate: -0.69,
  sign: "down",
  open: 7706.64,
  high: 7713.95,
  low: 7688.63,
  advCount: 0,
  declCount: 0,
  time: { date: "20260818", hour: "163800" },
  ...over,
});

describe("buildIndexCell", () => {
  it("해외 · quote 최우선 (분봉·daily 있어도) → live 셀은 quote 원본", () => {
    const q = overseasQuote({ price: 7000, change: -10, changeRate: -0.1 });
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasQuote: q,
      overseasLatestBar: bar({ close: 9999 }),
      latestDaily: daily({ close: 8888 }),
    });
    expect(cell?.live?.price).toBe(7000);
    expect(cell?.live?.change).toBe(-10);
    expect(cell?.live?.time).toEqual({ date: "20260818", hour: "163800" });
    expect(cell?.fallback).toBeNull();
  });

  it("해외 · quote 있으면 name 은 호출측 name 으로 오버라이드 (KIS hts_kor_isnm 무시)", () => {
    const q = overseasQuote({ name: "S&P500" });
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasQuote: q,
      overseasLatestBar: null,
      latestDaily: null,
    });
    expect(cell?.live?.name).toBe("S&P 500");
  });

  it("해외 · quote 없고 최신 분봉 있음 → 분봉 승격", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasQuote: null,
      overseasLatestBar: bar({ close: 5100, change: 40, changeRate: 0.8 }),
      latestDaily: daily(),
    });
    expect(cell?.live).toMatchObject({
      name: "S&P 500",
      price: 5100,
      change: 40,
      changeRate: 0.8,
      sign: "up",
      time: null,
    });
    expect(cell?.fallback).toBeNull();
  });

  it("해외 · quote·분봉 없고 daily 있음 → fallback 셀 (EOD)", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasQuote: null,
      overseasLatestBar: null,
      latestDaily: daily({ close: 5030 }),
    });
    expect(cell?.live).toBeNull();
    expect(cell?.fallback?.close).toBe(5030);
  });

  it("해외 · 셋 다 없음 → undefined", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasQuote: null,
      overseasLatestBar: null,
      latestDaily: null,
    });
    expect(cell).toBeUndefined();
  });

  it("해외 · 분봉 하락 → sign='down' (분봉 승격 경로)", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasQuote: null,
      overseasLatestBar: bar({ change: -5 }),
      latestDaily: null,
    });
    expect(cell?.live?.sign).toBe("down");
  });

  it("해외 · 분봉 change=0 → sign='flat'", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasQuote: null,
      overseasLatestBar: bar({ change: 0 }),
      latestDaily: null,
    });
    expect(cell?.live?.sign).toBe("flat");
  });

  it("국내 · domesticCell 우선 반환 (해외 quote·분봉 있어도 무시)", () => {
    const dc = domesticCell();
    const cell = buildIndexCell({
      isDomestic: true,
      name: "코스피",
      domesticCell: dc,
      overseasQuote: overseasQuote(),
      overseasLatestBar: bar(),
      latestDaily: daily(),
    });
    expect(cell).toBe(dc);
  });

  it("국내 · loading (domesticCell=undefined) → undefined 그대로", () => {
    const cell = buildIndexCell({
      isDomestic: true,
      name: "코스피",
      domesticCell: undefined,
      overseasQuote: null,
      overseasLatestBar: bar(),
      latestDaily: daily(),
    });
    expect(cell).toBeUndefined();
  });
});
