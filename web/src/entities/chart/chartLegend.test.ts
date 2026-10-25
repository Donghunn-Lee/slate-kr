import { describe, it, expect } from "vitest";
import type { ChartBar } from "@/shared/types/quote";
import { changeBasis, formatChangePct } from "./chartLegend";

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
