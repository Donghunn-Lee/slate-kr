import { describe, expect, it } from "vitest";
import type { StockQuote } from "@/shared/types/quote";
import { computeHeaderStats } from "./stockHeaderStats";

const SHARES = 5_846_278_608;
const stored = { volume: 21_259_056, close: 263_000, date: "2026-10-08" };

const quoteOf = (price: number, volume: number): StockQuote => ({
  ticker: "005930",
  price,
  change: 0,
  changeRate: 0,
  sign: "flat",
  open: 0,
  high: 0,
  low: 0,
  volume,
});

describe("computeHeaderStats — 표시 현재가와 같은 소스", () => {
  it("라이브 KRX(J): quote 거래량 · 현재가 × shares · 응답 거래일", () => {
    const quote = quoteOf(250_500, 17_356_465);
    expect(
      computeHeaderStats({
        source: "quote",
        quote,
        quoteDate: "2026-10-12",
        stored,
        shares: SHARES,
      })
    ).toEqual({
      volume: 17_356_465,
      marketCap: 250_500 * SHARES,
      baseDate: "2026-10-12",
    });
  });

  it("라이브 NXT(NX): NXT 체결분 거래량을 그대로 쓴다", () => {
    const quote = quoteOf(250_500, 8_796_168);
    expect(
      computeHeaderStats({
        source: "quote",
        quote,
        quoteDate: "2026-10-12",
        stored,
        shares: SHARES,
      }).volume
    ).toBe(8_796_168);
  });

  it("저장 행 폴백: 저장 행 거래량 · 종가 × shares · 저장 행 날짜 (서버 marketCap 과 같은 식)", () => {
    expect(
      computeHeaderStats({ source: "stored", quote: null, quoteDate: null, stored, shares: SHARES })
    ).toEqual({
      volume: 21_259_056,
      marketCap: 263_000 * SHARES,
      baseDate: "2026-10-08",
    });
  });

  it("저장 행 폴백은 응답이 있어도 응답 값을 보지 않는다", () => {
    const quote = quoteOf(250_500, 17_356_465);
    expect(
      computeHeaderStats({
        source: "stored",
        quote,
        quoteDate: "2026-10-12",
        stored,
        shares: SHARES,
      })
    ).toEqual({ volume: 21_259_056, marketCap: 263_000 * SHARES, baseDate: "2026-10-08" });
  });

  it("스냅샷(NXT 장외): 스냅샷 거래량 · 스냅샷 가격 × shares · 스냅샷 날짜(응답 date 와 달라도)", () => {
    // 늦은 preopen(08:50~09:00): 응답 date 는 오늘, quoteDate 는 캡처 행(전 거래일).
    const quote = quoteOf(262_500, 9_093_043);
    expect(
      computeHeaderStats({
        source: "quote",
        quote,
        quoteDate: "2026-10-08",
        stored,
        shares: SHARES,
      })
    ).toEqual({
      volume: 9_093_043,
      marketCap: 262_500 * SHARES,
      baseDate: "2026-10-08",
    });
  });

  it("quote 실패(source=quote, quote=null): 저장 행으로 폴백", () => {
    expect(
      computeHeaderStats({
        source: "quote",
        quote: null,
        quoteDate: "2026-10-12",
        stored,
        shares: SHARES,
      })
    ).toEqual({ volume: 21_259_056, marketCap: 263_000 * SHARES, baseDate: "2026-10-08" });
  });

  it("shares 없음(null·0): 시가총액 null, 거래량·기준일은 그대로", () => {
    const quote = quoteOf(250_500, 17_356_465);
    expect(
      computeHeaderStats({ source: "quote", quote, quoteDate: "2026-10-12", stored, shares: null })
    ).toEqual({ volume: 17_356_465, marketCap: null, baseDate: "2026-10-12" });
    expect(
      computeHeaderStats({ source: "stored", quote: null, quoteDate: null, stored, shares: 0 })
        .marketCap
    ).toBeNull();
  });

  it("저장 행 날짜 조회 실패(null): 기준일 null", () => {
    expect(
      computeHeaderStats({
        source: "stored",
        quote: null,
        quoteDate: null,
        stored: { ...stored, date: null },
        shares: SHARES,
      }).baseDate
    ).toBeNull();
  });
});
