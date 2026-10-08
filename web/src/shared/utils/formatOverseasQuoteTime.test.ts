import { describe, it, expect } from "vitest";
import {
  formatOverseasQuoteTime,
  resolveOverseasCloseLabel,
} from "./formatOverseasQuoteTime";

describe("formatOverseasQuoteTime", () => {
  // ── 아시아 고정 오프셋 ────────────────────────────────
  it("NI225 (JST=+0h vs KST) — 09:46 JST → 09:46 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260819", hour: "094600" },
        "NI225",
      ),
    ).toBe("08.19 09:46");
  });

  it("HSI (HKT=-1h vs KST) — 16:08 HKT → 17:08 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "160800" },
        "HSI",
      ),
    ).toBe("08.18 17:08");
  });

  it("SHCOMP (CST=-1h vs KST) — 15:00 CST → 16:00 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "150000" },
        "SHCOMP",
      ),
    ).toBe("08.18 16:00");
  });

  // ── ET DST 대조 ────────────────────────────────────
  it("SPX EDT (8월, ET=-13h vs KST) — 16:00 EDT 8/18 → 익일 05:00 KST 8/19", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "160000" },
        "SPX",
      ),
    ).toBe("08.19 05:00");
  });

  it("SPX EST (1월, ET=-14h vs KST) — 16:00 EST 1/15 → 익일 06:00 KST 1/16", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260115", hour: "160000" },
        "SPX",
      ),
    ).toBe("01.16 06:00");
  });

  // ── DAX 날짜 경계 (CEST=-7h vs KST) ─────────────────
  it("DAX CEST 17:30 8/18 → 익일 00:30 KST 8/19 (날짜 경계 넘김)", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "173000" },
        "DAX",
      ),
    ).toBe("08.19 00:30");
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

describe("resolveOverseasCloseLabel", () => {
  // ── 마감 instant KST 환산 — DST 양쪽 ─────────────────
  it("SPX EDT 9/4 세션 → 장 마감 · 09.05 05:00", () => {
    expect(resolveOverseasCloseLabel("2026-09-04", "SPX")).toBe(
      "장 마감 · 09.05 05:00",
    );
  });

  it("SPX EST 12/10 세션 → 장 마감 · 12.11 06:00 (DST 전환분 반영)", () => {
    expect(resolveOverseasCloseLabel("2026-12-10", "SPX")).toBe(
      "장 마감 · 12.11 06:00",
    );
  });

  it("DAX CEST 9/8 세션 → 장 마감 · 09.09 00:30 (날짜 경계 넘김)", () => {
    expect(resolveOverseasCloseLabel("2026-09-08", "DAX")).toBe(
      "장 마감 · 09.09 00:30",
    );
  });

  it("DAX CET 12/10 세션 → 장 마감 · 12.11 01:30 (DST 전환분 반영)", () => {
    expect(resolveOverseasCloseLabel("2026-12-10", "DAX")).toBe(
      "장 마감 · 12.11 01:30",
    );
  });

  it("NI225 9/8 세션 → 같은 날 장 마감 · 09.08 15:30", () => {
    expect(resolveOverseasCloseLabel("2026-09-08", "NI225")).toBe(
      "장 마감 · 09.08 15:30",
    );
  });

  // 금요일 세션 — 주말 내내 남는 라벨이라 날짜가 거래일(10.09)이 아닌 KST 마감일(토)인지 고정.
  it("SPX 금 10/9 세션 → 주말에도 장 마감 · 10.10 05:00", () => {
    expect(resolveOverseasCloseLabel("2026-10-09", "SPX")).toBe(
      "장 마감 · 10.10 05:00",
    );
  });

  // ── 방어 ────────────────────────────────────────
  it("sessionDate 길이 이상 → null", () => {
    expect(resolveOverseasCloseLabel("20260904", "SPX")).toBeNull();
  });

  it("sessionDate 숫자 아님 → null", () => {
    expect(resolveOverseasCloseLabel("2026-ab-04", "SPX")).toBeNull();
  });
});
