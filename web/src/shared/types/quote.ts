export type PriceSign = "up" | "down" | "flat";

export type LiveQuoteCore = {
  price: number; // 현재가 / 지수값
  change: number; // 전일 대비 (부호 포함)
  changeRate: number; // 등락률 (%)
  sign: PriceSign;
  open: number;
  high: number;
  low: number;
};

export type StockQuote = LiveQuoteCore & {
  ticker: string; // 종목코드 6자리
  volume: number; // 누적 거래량
};

export type IndexQuote = LiveQuoteCore & {
  name: string; // "코스피" | "코스닥" | "코스피200" (호출 측 주입)
  advCount: number; // 상승 종목수
  declCount: number; // 하락 종목수
};
