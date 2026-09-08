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
    ).toBe("08-19 09:46");
  });

  it("HSI (HKT=-1h vs KST) — 16:08 HKT → 17:08 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "160800" },
        "HSI",
      ),
    ).toBe("08-18 17:08");
  });

  it("SHCOMP (CST=-1h vs KST) — 15:00 CST → 16:00 KST", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "150000" },
        "SHCOMP",
      ),
    ).toBe("08-18 16:00");
  });

  // ── ET DST 대조 ────────────────────────────────────
  it("SPX EDT (8월, ET=-13h vs KST) — 16:00 EDT 8/18 → 익일 05:00 KST 8/19", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "160000" },
        "SPX",
      ),
    ).toBe("08-19 05:00");
  });

  it("SPX EST (1월, ET=-14h vs KST) — 16:00 EST 1/15 → 익일 06:00 KST 1/16", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260115", hour: "160000" },
        "SPX",
      ),
    ).toBe("01-16 06:00");
  });

  // ── DAX 날짜 경계 (CEST=-7h vs KST) ─────────────────
  it("DAX CEST 17:30 8/18 → 익일 00:30 KST 8/19 (날짜 경계 넘김)", () => {
    expect(
      formatOverseasQuoteTime(
        { date: "20260818", hour: "173000" },
        "DAX",
      ),
    ).toBe("08-19 00:30");
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
  // ── 마감 instant KST 환산 (세션 일자 = 마감 KST 일자면 "장 마감") ──
  it("SPX EDT 9/4 세션 → KST 9/5 05:00 마감", () => {
    expect(resolveOverseasCloseLabel("2026-09-04", "SPX", "2026-09-05")).toBe(
      "장 마감 · 05:00",
    );
  });

  it("SPX EST 12/10 세션 → KST 12/11 06:00 마감 (DST 전환분 반영)", () => {
    expect(resolveOverseasCloseLabel("2026-12-10", "SPX", "2026-12-11")).toBe(
      "장 마감 · 06:00",
    );
  });

  it("DAX CEST 9/8 세션 → KST 9/9 00:30 마감 (날짜 경계 넘김)", () => {
    expect(resolveOverseasCloseLabel("2026-09-08", "DAX", "2026-09-09")).toBe(
      "장 마감 · 00:30",
    );
  });

  it("NI225 9/8 세션 → 같은 날 KST 15:30 마감", () => {
    expect(resolveOverseasCloseLabel("2026-09-08", "NI225", "2026-09-08")).toBe(
      "장 마감 · 15:30",
    );
  });

  // ── 지난 세션 → 국내와 같은 MM.DD 표기 ─────────────────
  it("SPX 9/4 세션 · 오늘 9/8 → 전일 종가 · 09.04", () => {
    expect(resolveOverseasCloseLabel("2026-09-04", "SPX", "2026-09-08")).toBe(
      "전일 종가 · 09.04",
    );
  });

  // 마감 instant 가 KST 익일이면 세션 당일은 오늘 축이 아니다 (그 시각엔 장중 → live 팔).
  it("SPX 9/4 세션 · 오늘 9/4 → 전일 종가 · 09.04", () => {
    expect(resolveOverseasCloseLabel("2026-09-04", "SPX", "2026-09-04")).toBe(
      "전일 종가 · 09.04",
    );
  });

  it("DAX 9/8 세션 · 오늘 9/8 → 전일 종가 · 09.08 (마감이 KST 익일 00:30)", () => {
    expect(resolveOverseasCloseLabel("2026-09-08", "DAX", "2026-09-08")).toBe(
      "전일 종가 · 09.08",
    );
  });

  // 클라 시계 미가동(pre-mount) — today 축 없이도 날짜 표기는 확정된다.
  it("kstToday null → 전일 종가 · MM.DD", () => {
    expect(resolveOverseasCloseLabel("2026-09-04", "SPX", null)).toBe(
      "전일 종가 · 09.04",
    );
  });

  // ── 방어 ────────────────────────────────────────
  it("sessionDate 길이 이상 → null", () => {
    expect(resolveOverseasCloseLabel("20260904", "SPX", "2026-09-05")).toBeNull();
  });

  it("sessionDate 숫자 아님 → null", () => {
    expect(resolveOverseasCloseLabel("2026-ab-04", "SPX", "2026-09-05")).toBeNull();
  });
});
