import type { StockQuote } from "@/shared/types/quote";

// 헤더 통계 행(거래량·시가총액·기준일)의 소스. 표시 현재가가 어느 소스인지는 컴포넌트가
// 정하고(StockHeaderLivePrice 의 shownQuote), 여기서는 같은 소스의 값만 고른다.
//   - "quote": /api/stock-quote 응답 — 라이브 KIS 와 quote_snapshots 행 모두 이 모양으로
//     도착한다. NXT 탭의 거래량은 NX 채널(NXT 체결분)을 그대로 쓴다.
//   - "stored": SSR daily_prices 최신 행.
export type HeaderStatsSource = "quote" | "stored";

export type StoredHeaderRow = {
  volume: number;
  close: number;
  date: string | null; // 'YYYY-MM-DD'. 날짜 조회 실패 시 null.
};

export type HeaderStatsInput = {
  source: HeaderStatsSource;
  quote: StockQuote | null;
  quoteDate: string | null; // 응답 quoteDate. 응답 전엔 null.
  stored: StoredHeaderRow;
  shares: number | null; // stocks.shares. null·0 이하는 시총 null("-").
};

export type HeaderStats = {
  volume: number;
  marketCap: number | null;
  baseDate: string | null;
};

// 시가총액 = 가격 × stocks.shares(현재 상장주식수). 저장 행 소스면 저장 행 종가 기준.
const marketCapOf = (price: number, shares: number | null): number | null =>
  shares !== null && shares > 0 ? price * shares : null;

// source="quote" 인데 quote 가 없으면(KIS 실패·응답 전) 저장 행 — 표시 현재가도 같은 폴백을 탄다.
export const computeHeaderStats = ({
  source,
  quote,
  quoteDate,
  stored,
  shares,
}: HeaderStatsInput): HeaderStats => {
  if (source === "quote" && quote !== null) {
    return {
      volume: quote.volume,
      marketCap: marketCapOf(quote.price, shares),
      baseDate: quoteDate,
    };
  }
  return {
    volume: stored.volume,
    marketCap: marketCapOf(stored.close, shares),
    baseDate: stored.date,
  };
};
