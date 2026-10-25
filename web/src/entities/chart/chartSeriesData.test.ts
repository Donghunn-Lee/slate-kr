import { describe, it, expect } from "vitest";
import type { ChartBar } from "@/shared/types/quote";
import { computeSma, computeSmaLast, generateWhitespace } from "./chartSeriesData";

const bar = (time: string | number, close: number): ChartBar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
});

describe("computeSma", () => {
  it("period 미만 길이는 빈 배열", () => {
    expect(computeSma([bar(1, 10), bar(2, 20)], 3)).toEqual([]);
  });

  it("i >= period-1 자리부터 직전 period 개 평균", () => {
    // 길이 4 · period 3 → 점 2개 (index 2, 3)
    const bars = [bar(1, 10), bar(2, 20), bar(3, 30), bar(4, 40)];
    expect(computeSma(bars, 3)).toEqual([
      { time: 3, value: 20 },
      { time: 4, value: 30 },
    ]);
  });
});

describe("computeSmaLast", () => {
  it("전체 계산의 마지막 점과 같다", () => {
    const bars = [bar(1, 10), bar(2, 20), bar(3, 30), bar(4, 40)];
    expect(computeSmaLast(bars, 3)).toEqual(computeSma(bars, 3).at(-1));
  });

  it("period 미만 길이는 null", () => {
    expect(computeSmaLast([bar(1, 10)], 2)).toBeNull();
  });
});

describe("generateWhitespace", () => {
  it("숫자 time 은 UTCTimestamp 로 되짚는다", () => {
    const bars = [bar(100, 1), bar(160, 1), bar(220, 1)];
    expect(generateWhitespace(bars, 2)).toEqual([{ time: -20 }, { time: 40 }]);
  });

  it("문자열 time 은 일수로 환산해 되짚고 YYYY-MM-DD 로 되돌린다", () => {
    // 월 경계 (03-01 → 02-28 · 02-27) 를 넘는 되짚기
    const bars = [bar("2026-03-01", 1), bar("2026-03-02", 1), bar("2026-03-03", 1)];
    expect(generateWhitespace(bars, 2)).toEqual([{ time: "2026-02-27" }, { time: "2026-02-28" }]);
  });

  it("count<=0 또는 봉 2개 미만은 빈 배열", () => {
    expect(generateWhitespace([bar(1, 1), bar(2, 1)], 0)).toEqual([]);
    expect(generateWhitespace([bar(1, 1)], 3)).toEqual([]);
  });
});
