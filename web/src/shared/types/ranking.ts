export type MarketRankingKind =
  | { kind: "fluctuation"; direction: "up" | "down" }
  | { kind: "volume"; by: "volume" | "value" };

// changeSign 은 KIS prdy_vrss_sign 원본 문자열 (1=상한, 2=상승, 3=보합, 4=하한, 5=하락).
// PriceChange 로 넘길 때 up/down/flat 정규화가 필요하면 소비 계층에서 처리한다.
export type MarketRankingItem = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  changeSign: string;
  rank: number;
  volume?: number; // 누적 거래량(주). 응답에 존재하는 kind 에서만 채워짐.
  tradeValue?: number; // 누적 거래대금(원). volume-rank 응답에서만 채워짐.
};
