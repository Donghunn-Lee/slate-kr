import { describe, it, expect } from "vitest";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import { initialQuoteMarket, type QuoteMarket } from "@/shared/utils/market";
import { stockQuoteQueryKey } from "./useStockQuote";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음).
const kst = (y: number, m: number, d: number, h: number, min = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 2026-10-02 는 금요일 거래일. 10:00 = 정규장(KRX 기본), 08:30 = 개장 전 창(NXT 기본),
// 2026-10-03 토요일 = 휴장. nxEligible null 은 판정 불가(토글 미노출) 경로.
const TIMES: [string, Date, QuoteMarket][] = [
  ["정규장 10:00", kst(2026, 10, 2, 10), "krx"],
  ["개장 전 창 08:30", kst(2026, 10, 2, 8, 30), "nxt"],
  ["토요일", kst(2026, 10, 3, 12), "krx"],
];

describe("stockQuoteQueryKey — 헤더·차트 구독 키 일치", () => {
  for (const [label, now, market] of TIMES) {
    for (const nxEligible of [true, false, null]) {
      it(`${label} · nxEligible=${String(nxEligible)}`, () => {
        expect(stockQuoteQueryKey("005930", initialQuoteMarket(nxEligible, now))).toEqual([
          "stock-quote",
          "005930",
          nxEligible === true ? market : "auto",
        ]);
      });
    }
  }
  // 정적 휴장표에 없는 임시 휴장은 캘린더로만 닫힌다 — 캘린더를 빠뜨리면 거래일로 보고 NXT 를 고른다.
  it("캘린더 임시 휴장일 08:30 · nxEligible=true → krx", () => {
    const calendar: MarketCalendar = { KRX: { "2026-10-02": false } };
    expect(
      stockQuoteQueryKey("005930", initialQuoteMarket(true, kst(2026, 10, 2, 8, 30), calendar)),
    ).toEqual(["stock-quote", "005930", "krx"]);
  });
});

describe("stockQuoteQueryKey — 시장 축 분리", () => {
  it("미지정은 auto 로 krx 와 다른 항목", () => {
    expect(stockQuoteQueryKey("005930")).toEqual(["stock-quote", "005930", "auto"]);
    expect(stockQuoteQueryKey("005930")).not.toEqual(stockQuoteQueryKey("005930", "krx"));
  });
  it("krx 와 nxt 는 다른 항목", () => {
    expect(stockQuoteQueryKey("005930", "krx")).not.toEqual(stockQuoteQueryKey("005930", "nxt"));
  });
});
