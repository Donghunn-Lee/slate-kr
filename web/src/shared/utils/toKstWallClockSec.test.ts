import { describe, it, expect } from "vitest";
import { toKstWallClockSec } from "./toKstWallClockSec";

// 벽시계 필드 → UTC 위장 epoch 초 (분봉 time 인코딩과 같은 규칙).
const enc = (y: number, m: number, d: number, h: number, min = 0): number =>
  Math.floor(Date.UTC(y, m - 1, d, h, min) / 1000);

const NY = "America/New_York";
const BERLIN = "Europe/Berlin";

describe("toKstWallClockSec", () => {
  // ── 미국 서머타임 / 표준시 ───────────────────────────
  it("SPX EDT 7/15 09:30 → KST 7/15 22:30 (+13h)", () => {
    expect(toKstWallClockSec(enc(2026, 7, 15, 9, 30), NY)).toBe(enc(2026, 7, 15, 22, 30));
  });

  it("SPX EST 1/15 09:30 → KST 1/15 23:30 (+14h)", () => {
    expect(toKstWallClockSec(enc(2026, 1, 15, 9, 30), NY)).toBe(enc(2026, 1, 15, 23, 30));
  });

  // KST 자정은 미국 세션 중간 — 날짜가 바뀌는 첫 시각.
  it("SPX EDT 7/15 11:00 → KST 7/16 00:00 (KST 자정 넘김)", () => {
    expect(toKstWallClockSec(enc(2026, 7, 15, 11, 0), NY)).toBe(enc(2026, 7, 16, 0, 0));
  });

  // ── DAX 서머타임 / 표준시 ────────────────────────────
  it("DAX CEST 7/15 17:30 → KST 7/16 00:30 (+7h)", () => {
    expect(toKstWallClockSec(enc(2026, 7, 15, 17, 30), BERLIN)).toBe(enc(2026, 7, 16, 0, 30));
  });

  it("DAX CET 1/15 17:30 → KST 1/16 01:30 (+8h)", () => {
    expect(toKstWallClockSec(enc(2026, 1, 15, 17, 30), BERLIN)).toBe(enc(2026, 1, 16, 1, 30));
  });

  // ── 아시아 고정 오프셋 ───────────────────────────────
  it("HSI 7/15 16:00 HKT → KST 17:00 (+1h)", () => {
    expect(toKstWallClockSec(enc(2026, 7, 15, 16, 0), "Asia/Hong_Kong")).toBe(
      enc(2026, 7, 15, 17, 0),
    );
  });

  it("SHCOMP 7/15 15:00 CST → KST 16:00 (+1h)", () => {
    expect(toKstWallClockSec(enc(2026, 7, 15, 15, 0), "Asia/Shanghai")).toBe(
      enc(2026, 7, 15, 16, 0),
    );
  });

  it("NI225 7/15 09:00 JST → KST 09:00 (변화 없음)", () => {
    expect(toKstWallClockSec(enc(2026, 7, 15, 9, 0), "Asia/Tokyo")).toBe(enc(2026, 7, 15, 9, 0));
  });

  // ── 서머타임 전환 주의 전후 (2026: 유럽 10/25 · 미국 11/1 종료, 미국 3/8 시작) ──
  // 유럽만 먼저 끝나는 주(10/26~10/30)는 DAX +8h 인데 미국은 아직 +13h 다.
  it("DAX 전환 전 금 10/23 17:30 CEST → KST 10/24 00:30", () => {
    expect(toKstWallClockSec(enc(2026, 10, 23, 17, 30), BERLIN)).toBe(enc(2026, 10, 24, 0, 30));
  });

  it("DAX 전환 후 월 10/26 17:30 CET → KST 10/27 01:30", () => {
    expect(toKstWallClockSec(enc(2026, 10, 26, 17, 30), BERLIN)).toBe(enc(2026, 10, 27, 1, 30));
  });

  it("SPX 전환 전 금 10/30 16:00 EDT → KST 10/31 05:00", () => {
    expect(toKstWallClockSec(enc(2026, 10, 30, 16, 0), NY)).toBe(enc(2026, 10, 31, 5, 0));
  });

  it("SPX 전환 후 월 11/2 16:00 EST → KST 11/3 06:00", () => {
    expect(toKstWallClockSec(enc(2026, 11, 2, 16, 0), NY)).toBe(enc(2026, 11, 3, 6, 0));
  });

  it("SPX 시작 전 금 3/6 16:00 EST → KST 3/7 06:00 · 시작 후 월 3/9 16:00 EDT → KST 3/10 05:00", () => {
    expect(toKstWallClockSec(enc(2026, 3, 6, 16, 0), NY)).toBe(enc(2026, 3, 7, 6, 0));
    expect(toKstWallClockSec(enc(2026, 3, 9, 16, 0), NY)).toBe(enc(2026, 3, 10, 5, 0));
  });
});
