export type Market = "all" | "kospi" | "kosdaq";

export type MarketRankingKind =
  | { kind: "fluctuation"; direction: "up" | "down"; market: Market }
  | { kind: "volume"; by: "volume" | "value"; market: Market };

// changeSign 은 KIS prdy_vrss_sign 원본 문자열 (1=상한, 2=상승, 3=보합, 4=하한, 5=하락).
// PriceChange 로 넘길 때 up/down/flat 정규화가 필요하면 소비 계층에서 처리한다.
export type MarketRankingItem = {
  ticker: string;
  name: string;
  price: number;
  change: number; // 전일 대비 (원, 부호 포함) — KIS prdy_vrss 원본.
  changePct: number;
  changeSign: string;
  rank: number;
  volume?: number; // 누적 거래량(주). 응답에 존재하는 kind 에서만 채워짐.
  tradeValue?: number; // 누적 거래대금(원). volume-rank 응답에서만 채워짐.
};
