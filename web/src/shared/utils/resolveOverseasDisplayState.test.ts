import { describe, it, expect } from "vitest";
import { resolveOverseasDisplayState } from "./resolveOverseasDisplayState";

describe("resolveOverseasDisplayState", () => {
  // ── 경계 판정 (close 상수 기준) ────────────────────────
  it("SPX 15:59 ET → live (close 1600 직전)", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "155900" },
        "SPX",
      ),
    ).toEqual({ kind: "live" });
  });

  it("SPX 16:00 ET → closed (close 경계 포함)", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "160000" },
        "SPX",
      ),
    ).toEqual({ kind: "closed" });
  });

  it("SPX 16:00:01 ET → closed (초 단위 무시)", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "160001" },
        "SPX",
      ),
    ).toEqual({ kind: "closed" });
  });

  // ── 자정 넘긴 새벽: 전일 마감 체결시각이 아직 잔존 (다음 세션 미개시) ──
  it("SPX 마감 후 KST 새벽: hour 는 여전히 16:00 → closed 유지", () => {
    // KST 05:00 새벽에도 KIS 응답은 여전히 date=8/18, hour=16:00:00 (ET)
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "160000" },
        "SPX",
      ),
    ).toEqual({ kind: "closed" });
  });

  // ── 새 세션 첫 체결 → 자동 live 복귀 (open 상수 불필요) ────
  it("SPX 다음 세션 09:30 ET 첫 체결 → live (자동 해제)", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260819", hour: "093000" },
        "SPX",
      ),
    ).toEqual({ kind: "live" });
  });

  // ── time null (.DJI 계열) ──────────────────────────
  it("time null → eod_only", () => {
    expect(resolveOverseasDisplayState(null, ".DJI")).toEqual({
      kind: "eod_only",
    });
  });

  it("hour 길이 이상 → eod_only", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "1600" },
        "SPX",
      ),
    ).toEqual({ kind: "eod_only" });
  });

  // ── 8종 close 상수별 경계 판정 ─────────────────────────
  it("NI225 15:29 JST → live / 15:30 JST → closed", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "152900" },
        "NI225",
      ),
    ).toEqual({ kind: "live" });
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "153000" },
        "NI225",
      ),
    ).toEqual({ kind: "closed" });
  });

  it("HSI 15:59 HKT → live / 16:00 HKT → closed", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "155900" },
        "HSI",
      ),
    ).toEqual({ kind: "live" });
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "160000" },
        "HSI",
      ),
    ).toEqual({ kind: "closed" });
  });

  it("SHCOMP 14:59 CST → live / 15:00 CST → closed", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "145900" },
        "SHCOMP",
      ),
    ).toEqual({ kind: "live" });
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "150000" },
        "SHCOMP",
      ),
    ).toEqual({ kind: "closed" });
  });

  it("DAX 17:29 CEST → live / 17:30 CEST → closed", () => {
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "172900" },
        "DAX",
      ),
    ).toEqual({ kind: "live" });
    expect(
      resolveOverseasDisplayState(
        { date: "20260818", hour: "173000" },
        "DAX",
      ),
    ).toEqual({ kind: "closed" });
  });

  it("COMP/NDX 15:59 ET → live / 16:00 ET → closed", () => {
    for (const code of ["COMP", "NDX"] as const) {
      expect(
        resolveOverseasDisplayState(
          { date: "20260818", hour: "155900" },
          code,
        ),
      ).toEqual({ kind: "live" });
      expect(
        resolveOverseasDisplayState(
          { date: "20260818", hour: "160000" },
          code,
        ),
      ).toEqual({ kind: "closed" });
    }
  });
});
