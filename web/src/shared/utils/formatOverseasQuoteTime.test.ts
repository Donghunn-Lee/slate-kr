import { describe, it, expect } from "vitest";
import { formatOverseasQuoteTime } from "./formatOverseasQuoteTime";

describe("formatOverseasQuoteTime", () => {
  // ── 아시아 고정 오프셋 ────────────────────────────────
  it("NI225 (JST=+0h vs KST) — 09:46 JST → 09:46 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260819", hour: "094600" },
        "NI225",
      ),
    ).toBe("08-19 09:46 기준");
  });

  it("HSI (HKT=-1h vs KST) — 16:08 HKT → 17:08 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "160800" },
        "HSI",
      ),
    ).toBe("08-18 17:08 기준");
  });

  it("SHCOMP (CST=-1h vs KST) — 15:00 CST → 16:00 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "150000" },
        "SHCOMP",
      ),
    ).toBe("08-18 16:00 기준");
  });

  // ── ET DST 대조 ────────────────────────────────────
  it("SPX EDT (8월, ET=-13h vs KST) — 16:00 EDT 8/18 → 익일 05:00 KST 8/19", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "160000" },
        "SPX",
      ),
    ).toBe("08-19 05:00 기준");
  });

  it("SPX EST (1월, ET=-14h vs KST) — 16:00 EST 1/15 → 익일 06:00 KST 1/16", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260115", hour: "160000" },
        "SPX",
      ),
    ).toBe("01-16 06:00 기준");
  });

  // ── DAX 날짜 경계 (CEST=-7h vs KST) ─────────────────
  it("DAX CEST 17:30 8/18 → 익일 00:30 KST 8/19 (날짜 경계 넘김)", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "173000" },
        "DAX",
      ),
    ).toBe("08-19 00:30 기준");
  });

  // ── 방어 ────────────────────────────────────────
  it("time=null → null", () => {
    expect(formatOverseasQuoteTime(null, "SPX")).toBeNull();
  });

  it("date 길이 이상 → null", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "2026818", hour: "163856" },
        "SPX",
      ),
    ).toBeNull();
  });

  it("hour 길이 이상 → null", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "1638" },
        "SPX",
      ),
    ).toBeNull();
  });
});
