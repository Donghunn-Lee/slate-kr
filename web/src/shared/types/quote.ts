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

export type IndexDailySnapshot = {
  indexCode: string; // "KOSPI" | "KOSDAQ" | "KOSPI200"
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changeRate: number;
};

// 10분봉(인트라데이) 1행. lightweight-charts가 분 단위 데이터를 UTCTimestamp(=epoch 초)로만
// 받기 때문에 ISO 문자열이 아니라 number 로 보관한다.
// 차트 가로축이 UTC 기준으로 표시되므로, KST 시각을 "UTC로 위장"해서 저장한다
// (KST 10:30 → 차트는 "10:30"으로 표기). 정규화는 lib/indices.ts 참조.
export type IndexIntradaySnapshot = {
  indexCode: string;
  timestamp: number; // KST를 UTC로 위장한 epoch 초
  open: number;
  high: number;
  low: number;
  close: number;
  change: number; // 전일 종가 대비
  changeRate: number; // %
};

// 캔들 차트 렌더링 최소 필드. lightweight-charts의 time은 'YYYY-MM-DD'(BusinessDay)
// 또는 epoch 초(UTCTimestamp) 둘 다 받으므로 유니온으로 둔다.
// volume 은 histogram 오버레이 전용. 값이 있는 봉만 그린다(지수 bars 는 미보유 → 스킵).
export type ChartBar = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};
