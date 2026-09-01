import { describe, it, expect } from "vitest";
import { makeLeadingWhitespace } from "./leadingWhitespace";

describe("makeLeadingWhitespace", () => {
  it("일봉: 금→월 3d 간격 포함해도 step=1d 로 산정", () => {
    // gap 순서: 1,1,1,3,1 → min = 1 (금→월 3d 는 최솟값이 아니므로 무시)
    const bars = [
      { time: 100 },
      { time: 101 },
      { time: 102 },
      { time: 103 },
      { time: 106 },
      { time: 107 },
    ];
    expect(makeLeadingWhitespace(bars, 3)).toEqual([
      { time: 97 },
      { time: 98 },
      { time: 99 },
    ]);
  });

  it("주봉: step=7d", () => {
    const bars = [
      { time: 100 },
      { time: 107 },
      { time: 114 },
      { time: 121 },
    ];
    expect(makeLeadingWhitespace(bars, 2)).toEqual([
      { time: 86 },
      { time: 93 },
    ]);
  });

  it("count=0 → []", () => {
    expect(makeLeadingWhitespace([{ time: 100 }, { time: 101 }], 0)).toEqual([]);
  });

  it("bars.length=1 → step 산정 불가 → []", () => {
    expect(makeLeadingWhitespace([{ time: 100 }], 5)).toEqual([]);
  });
});
