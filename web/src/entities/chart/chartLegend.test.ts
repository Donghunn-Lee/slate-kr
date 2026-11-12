import { describe, it, expect } from "vitest";
import { CHART_THEME } from "@/shared/constants/chart";
import type { ChartBar } from "@/shared/types/quote";
import { changeBasis, formatChangePct, paintLegend } from "./chartLegend";

const bar = (close: number, basePrice?: number): ChartBar => ({
  time: 1,
  open: close,
  high: close,
  low: close,
  close,
  basePrice,
});

describe("formatChangePct", () => {
  it("상승은 + 부호, 하락은 - 부호, 보합은 부호 없음", () => {
    expect(formatChangePct(110, 100)).toBe("+10.00%");
    expect(formatChangePct(90, 100)).toBe("-10.00%");
    expect(formatChangePct(100, 100)).toBe("0.00%");
  });

  it("기준가 없음 · 0 은 null (0 나눗셈 회피)", () => {
    expect(formatChangePct(100, null)).toBeNull();
    expect(formatChangePct(100, 0)).toBeNull();
  });
});

describe("changeBasis", () => {
  it("봉의 basePrice 가 직전 봉 close 보다 우선", () => {
    const bars = [bar(100), bar(110, 105)];
    expect(changeBasis(bars, 1)).toBe(105);
  });

  it("basePrice 없으면 직전 봉 close, 첫 봉은 null", () => {
    const bars = [bar(100), bar(110)];
    expect(changeBasis(bars, 1)).toBe(100);
    expect(changeBasis(bars, 0)).toBeNull();
  });
});

describe("paintLegend", () => {
  it("candle 시가=종가 봉은 종가에 색 style 을 붙이지 않는다", () => {
    const el = { innerHTML: "" } as HTMLDivElement;
    const palette = CHART_THEME.light;
    // 기준가를 종가와 다르게 둬 등락률에는 색이 붙게 한다 — style 이 종가에서만 빠졌는지 가른다
    paintLegend(el, bar(100), 90, palette, String, "candle", false);
    expect(el.innerHTML).toContain('<span class="text-muted-foreground">종</span> 100<');
    expect(el.innerHTML).toContain(`<span style="color:${palette.up}">+11.11%</span>`);
  });
});
