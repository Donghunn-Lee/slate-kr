import { describe, it, expect } from "vitest";
import { formatOverseasQuoteTime } from "./formatOverseasQuoteTime";

describe("formatOverseasQuoteTime", () => {
  it("정상 입력 → 'MM-DD HH:mm (현지)' (초 절삭)", () => {
    expect(
      formatOverseasQuoteTime({ date: "20260818", hour: "163856" }),
    ).toBe("08-18 16:38 (현지)");
  });

  it("자정 인접 시각 (00:00) 정상 렌더", () => {
    expect(
      formatOverseasQuoteTime({ date: "20260101", hour: "000000" }),
    ).toBe("01-01 00:00 (현지)");
  });

  it("time=null → null", () => {
    expect(formatOverseasQuoteTime(null)).toBeNull();
  });

  it("date 길이 이상 → null (스키마 신뢰 방어)", () => {
    expect(
      formatOverseasQuoteTime({ date: "2026818", hour: "163856" }),
    ).toBeNull();
  });

  it("hour 길이 이상 → null", () => {
    expect(
      formatOverseasQuoteTime({ date: "20260818", hour: "1638" }),
    ).toBeNull();
  });
});
