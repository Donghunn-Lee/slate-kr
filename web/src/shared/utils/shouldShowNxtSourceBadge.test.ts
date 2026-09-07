import { describe, it, expect } from "vitest";
import { shouldShowNxtSourceBadge } from "./shouldShowNxtSourceBadge";

const TRADING_DATE = "2026-09-07";
const PREV_DATE = "2026-09-04";

// 오늘 EOD 가 적재된 상태의 종가. 라이브가와 다르게 둔다.
const TODAY_EOD = { close: 70_000, date: TRADING_DATE };
const PREV_EOD = { close: 70_000, date: PREV_DATE };

describe("shouldShowNxtSourceBadge", () => {
  it("quote 부재 → false (EOD 만 표시 중)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: null,
        eod: TODAY_EOD,
        session: "after",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(false);
  });

  // ── source 축 ────────────────────────────────────────
  it("krx 단독 체결가 → false", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "krx", price: 71_000 },
        eod: TODAY_EOD,
        session: "after",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(false);
  });

  it("nx 단독 체결가 → true (세션·날짜 무관)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "nx", price: 70_000 },
        eod: PREV_EOD,
        session: "regular",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(true);
  });

  it("nx 단독 체결가 → true (eod 부재여도 표시)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "nx", price: 70_000 },
        eod: undefined,
        session: "closed",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(true);
  });

  // ── un: 세션 게이트 ──────────────────────────────────
  it("un × regular → false (장중 전 종목 상시 노출 방지)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: PREV_EOD,
        session: "regular",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(false);
  });

  // ── un: 마감 후 세션의 EOD 적재 지연 창 ──────────────
  it("un × after × eod.date 가 전일 → false (적재 지연 창)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: PREV_EOD,
        session: "after",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(false);
  });

  it("un × after_close × eod.date 가 전일 → false (적재 지연 창)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: PREV_EOD,
        session: "after_close",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(false);
  });

  it("un × after × eod.date 가 당일 × 가격 상이 → true", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: TODAY_EOD,
        session: "after",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(true);
  });

  // ── un: 마감 후가 아닌 세션은 날짜 비교를 하지 않는다 ──
  it("un × pre × eod.date 가 전일 × 가격 상이 → true (프리마켓)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: PREV_EOD,
        session: "pre",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(true);
  });

  it("un × preopen × eod.date 가 전일 × 가격 상이 → true", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: PREV_EOD,
        session: "preopen",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(true);
  });

  // ── un: 가격 동일 / eod 부재 ─────────────────────────
  it("un × 비regular × 가격 동일 → false", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 70_000 },
        eod: TODAY_EOD,
        session: "after",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(false);
  });

  it("un × eod 부재 → false (비교 기준 없음)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: undefined,
        session: "preopen",
        tradingDate: TRADING_DATE,
      }),
    ).toBe(false);
  });

  it("un × after × tradingDate 미도착 → false (날짜 축 확인 불가)", () => {
    expect(
      shouldShowNxtSourceBadge({
        quote: { source: "un", price: 71_000 },
        eod: TODAY_EOD,
        session: "after",
        tradingDate: undefined,
      }),
    ).toBe(false);
  });
});
