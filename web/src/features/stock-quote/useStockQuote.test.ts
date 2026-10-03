import { describe, it, expect } from "vitest";
import { defaultQuoteMarket, type QuoteMarket } from "@/shared/utils/market";
import { stockQuoteQueryKey } from "./useStockQuote";

// 명시적 UTC epoch 로 KST 로컬 시각을 유도 (KST = UTC+9, DST 없음).
const kst = (y: number, m: number, d: number, h: number, min = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, h - 9, min));

// 헤더(StockHeaderLivePrice)와 차트 구독(StockChart·StockChartTabs)의 마운트 시 market 인자
// 조립식. 훅은 vitest node 환경에서 렌더할 수 없으므로 호출부 식을 복제해 고정한다.
const headerMarketArg = (nxEligible: boolean | null, now: Date): QuoteMarket | undefined => {
  const showToggle = nxEligible === true;
  const market: QuoteMarket = showToggle ? defaultQuoteMarket(now) : "krx";
  return showToggle ? market : undefined;
};
const chartSubscribeMarket = (nxEligible: boolean | null, now: Date): QuoteMarket | undefined =>
  nxEligible === true ? defaultQuoteMarket(now) : undefined;

// 2026-10-02 는 금요일 거래일. 10:00 = 정규장(KRX 기본), 08:30 = 개장 전 창(NXT 기본),
// 2026-10-03 토요일 = 휴장. nxEligible null 은 판정 불가(토글 미노출) 경로.
const TIMES: [string, Date][] = [
  ["정규장 10:00", kst(2026, 10, 2, 10)],
  ["개장 전 창 08:30", kst(2026, 10, 2, 8, 30)],
  ["토요일", kst(2026, 10, 3, 12)],
];

describe("stockQuoteQueryKey — 헤더·차트 구독 키 일치", () => {
  for (const [label, now] of TIMES) {
    for (const nxEligible of [true, false, null]) {
      it(`${label} · nxEligible=${String(nxEligible)}`, () => {
        expect(stockQuoteQueryKey("005930", headerMarketArg(nxEligible, now))).toEqual(
          stockQuoteQueryKey("005930", chartSubscribeMarket(nxEligible, now))
        );
      });
    }
  }
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
