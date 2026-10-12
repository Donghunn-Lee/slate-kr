import { describe, it, expect } from "vitest";
import { isPreMarketReset } from "@/entities/stock/stockHeaderLabel";
import type { KrxSession } from "@/shared/utils/market";
import { resolveListChange } from "@/shared/utils/resolveListChange";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음).
const kst = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 2026-07-23 은 목요일 거래일, 2026-01-01 은 휴장일.
const t = (h: number, min = 0): Date => kst(2026, 7, 23, h, min);

// useMultiQuote 가 소비측에 넘기는 축. 리스트 표면엔 KRX/NXT 탭이 없어 market 은 "krx" 고정.
const listPreReset = (session: KrxSession | undefined, now: Date | null): boolean =>
  isPreMarketReset(session, "krx", now);

const LIVE = { change: 3_000, changeRate: 0.18 };
const EOD = { change: 1_150, changePct: 2.4 };

describe("useMultiQuote preReset — 리스트 표면의 KRX 고정 축", () => {
  it("08:20 pre → true", () => {
    expect(listPreReset("pre", t(8, 20))).toBe(true);
  });
  it("08:55 늦은 preopen → true", () => {
    expect(listPreReset("preopen", t(8, 55))).toBe(true);
  });
  it("07:30 이른 preopen → false (창 밖 — 직전 마감 표면 유지)", () => {
    expect(listPreReset("preopen", t(7, 30))).toBe(false);
  });
  it("09:10 regular → false", () => {
    expect(listPreReset("regular", t(9, 10))).toBe(false);
  });
  it("16:00 after → false", () => {
    expect(listPreReset("after", t(16, 0))).toBe(false);
  });
  it("휴장일 08:30 → false", () => {
    expect(listPreReset("closed", kst(2026, 1, 1, 8, 30))).toBe(false);
  });
  it("응답 전 session=undefined → false (헤더 pre-mount 와 동형)", () => {
    expect(listPreReset(undefined, t(8, 55))).toBe(false);
  });
  it("now=null (pre-mount) → false", () => {
    expect(listPreReset("pre", null)).toBe(false);
  });
});

describe("resolveListChange — 리셋은 EOD 폴백 팔에만", () => {
  it("preReset=true · live 있음 → 라이브 값 보존 (오늘 축이라 손대지 않음)", () => {
    expect(resolveListChange(LIVE.change, EOD.change, true)).toBe(3_000);
    expect(resolveListChange(LIVE.changeRate, EOD.changePct, true)).toBe(0.18);
  });
  it("preReset=true · live 없음 · EOD 있음 → 0 (전일 등락 제거)", () => {
    expect(resolveListChange(null, EOD.change, true)).toBe(0);
    expect(resolveListChange(null, EOD.changePct, true)).toBe(0);
  });
  it("preReset=false · live 없음 · EOD 있음 → EOD 값", () => {
    expect(resolveListChange(null, EOD.change, false)).toBe(1_150);
    expect(resolveListChange(null, EOD.changePct, false)).toBe(2.4);
  });
  it("preReset=true · live 없음 · EOD 없음 → null (0 아님 — 표시할 값 자체가 없음)", () => {
    expect(resolveListChange(null, undefined, true)).toBeNull();
  });
  it("preReset=true · live 없음 · EOD 행은 있으나 등락 결측 → 0", () => {
    expect(resolveListChange(null, null, true)).toBe(0);
  });
});
