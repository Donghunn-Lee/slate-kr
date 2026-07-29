import { describe, it, expect } from "vitest";
import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
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
    ...over,
  },
  fallback: null,
});

describe("buildIndexCell", () => {
  it("해외 · 최신 분봉 있음 → live 셀 합성 (close/change/changeRate 승격)", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasLatestBar: bar({ close: 5100, change: 40, changeRate: 0.8 }),
      latestDaily: daily(),
    });
    expect(cell?.live).toMatchObject({
      name: "S&P 500",
      price: 5100,
      change: 40,
      changeRate: 0.8,
      sign: "up",
    });
    expect(cell?.fallback).toBeNull();
  });

  it("해외 · 분봉 하락 → sign='down'", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
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
      overseasLatestBar: bar({ change: 0 }),
      latestDaily: null,
    });
    expect(cell?.live?.sign).toBe("flat");
  });

  it("해외 · 분봉 없음 · daily 있음 → fallback 셀", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasLatestBar: null,
      latestDaily: daily({ close: 5030 }),
    });
    expect(cell?.live).toBeNull();
    expect(cell?.fallback?.close).toBe(5030);
  });

  it("해외 · 분봉 · daily 둘 다 없음 → undefined", () => {
    const cell = buildIndexCell({
      isDomestic: false,
      name: "S&P 500",
      domesticCell: undefined,
      overseasLatestBar: null,
      latestDaily: null,
    });
    expect(cell).toBeUndefined();
  });

  it("국내 · domesticCell 우선 반환 (해외 분봉 있어도 무시)", () => {
    const dc = domesticCell();
    const cell = buildIndexCell({
      isDomestic: true,
      name: "코스피",
      domesticCell: dc,
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
      overseasLatestBar: bar(),
      latestDaily: daily(),
    });
    expect(cell).toBeUndefined();
  });
});
