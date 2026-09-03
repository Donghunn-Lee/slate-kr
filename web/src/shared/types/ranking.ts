import type { StockSummary } from "@/shared/types/stock";

export type Market = "all" | "kospi" | "kosdaq";

export type MarketRankingKind =
  | { kind: "fluctuation"; direction: "up" | "down"; market: Market }
  | { kind: "volume"; by: "volume" | "value"; market: Market }
  | { kind: "market-cap"; market: Market }
  | { kind: "top-interest"; market: Market };

export const RANKING_KIND_IDS = [
  "fluctuation",
  "volume",
  "market-cap",
  "top-interest",
] as const satisfies readonly MarketRankingKind["kind"][];

// changeSign 은 KIS prdy_vrss_sign 원본 문자열 (1=상한, 2=상승, 3=보합, 4=하한, 5=하락).
// PriceChange 로 넘길 때 up/down/flat 정규화가 필요하면 소비 계층에서 처리한다.
// market 은 route 계층이 stocks 조회로 채우는 optional 필드. DB 매핑 실패해도
// row 는 살아남아야 하므로 undefined 를 허용한다. 요청 필터용 Market("all"/"kospi"/"kosdaq") 과
// 값 도메인이 다르므로 (StockSummary["market"] 는 "KOSPI"/"KOSDAQ") 혼동 방지.
// marketCap 은 원 단위(tradeValue 관례와 동일) — KIS stck_avls(억원)에 ×1e8 환산.
export type MarketRankingItem = {
  ticker: string;
  name: string;
  price: number;
  change: number; // 전일 대비 (원, 부호 포함) — KIS prdy_vrss 원본.
  changePct: number;
  changeSign: string;
  rank: number;
  market?: StockSummary["market"];
  volume?: number; // 누적 거래량(주). 응답에 존재하는 kind 에서만 채워짐.
  tradeValue?: number; // 누적 거래대금(원). volume-rank 응답에서만 채워짐.
  marketCap?: number; // 시가총액(원). market-cap 응답에서만 채워짐.
  interestCount?: number; // 관심종목 등록 계좌 수. top-interest 응답에서만 채워짐.
};
