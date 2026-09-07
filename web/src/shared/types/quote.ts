export type PriceSign = "up" | "down" | "flat";

// KIS FHKST01010100 output 판정 결과.
//   - suspended: 거래정지 (iscd_stat_cls_code=58)
//   - liquidation: 정리매매 (sltr_yn=Y)
//   - managed: 관리종목 (mang_issu_cls_code=Y)
//   - overheated: 단기과열 (iscd_stat_cls_code=59)
//   - caution / warning / risk: 시장경고 (mrkt_warn_cls_code=01/02/03)
//   - unavailable: 응답 축소로 판정 근거·시세 부재
export type MarketActionStatus = {
  kind:
    | "suspended"
    | "liquidation"
    | "managed"
    | "overheated"
    | "caution"
    | "warning"
    | "risk"
    | "unavailable";
};

export type LiveQuoteCore = {
  price: number; // 현재가 / 지수값
  change: number; // 전일 대비 (부호 포함)
  changeRate: number; // 등락률 (%)
  sign: PriceSign;
  open: number;
  high: number;
  low: number;
};

// 이 quote 가 어느 거래 채널에서 온 값인지. 헤더는 KRX/NXT 탭으로 출처가 명시적이지만
// 리스트형 표면(관심 행·홈 프리뷰·검색)에는 판정 지점이 없어 값과 함께 실어 나른다.
//   - "krx": KRX 단독 (KIS FID_COND_MRKT_DIV_CODE=J)
//   - "nx" : NXT 단독 (=NX)
//   - "un" : KRX+NXT 통합 (=UN, quote_snapshots 서빙 포함)
export type QuoteSource = "krx" | "nx" | "un";

export type StockQuote = LiveQuoteCore & {
  ticker: string; // 종목코드 6자리
  volume: number; // 누적 거래량
  source: QuoteSource; // 가격 출처 채널 (배지 판정은 클라 소관)
};

export type IndexQuote = LiveQuoteCore & {
  name: string; // "코스피" | "코스닥" | "코스피200" (호출 측 주입)
  advCount: number; // 상승 종목수
  declCount: number; // 하락 종목수
  // 해외 지수 체결시각(거래소 현지 로컬, 문자열 그대로). 국내·output2 부재(.DJI) 는 null.
  time: { date: string; hour: string } | null;
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
  // KRX ACC_TRDVOL(누적 거래량). 월봉 재샘플 시 resampleToMonthly 는 volume 을 출력에 담지 않으므로
  // 월봉 스냅샷에서는 결측 — 소비자가 별도 재주입한다 (IndexChart 참조).
  volume?: number;
};

// 지수 분봉(인트라데이) 1행. lightweight-charts가 분 단위 데이터를 UTCTimestamp(=epoch 초)로만
// 받기 때문에 ISO 문자열이 아니라 number 로 보관한다.
// 차트 가로축이 UTC 기준으로 표시되므로, KST 시각을 "UTC로 위장"해서 저장한다
// (KST 10:30 → 차트는 "10:30"으로 표기). 정규화는 lib/indices.ts 참조.
// timestamp = START 라벨 (봉 시작 시각). END 시프트·리샘플은 클라이언트 소관.
export type IndexIntradaySnapshot = {
  indexCode: string;
  timestamp: number; // KST를 UTC로 위장한 epoch 초 (START 라벨)
  open: number;
  high: number;
  low: number;
  close: number;
  change: number; // 전일 종가 대비
  changeRate: number; // %
  volume: number; // 해당 분봉 거래량 (histogram 오버레이용)
};

// 캔들 차트 렌더링 최소 필드. lightweight-charts의 time은 'YYYY-MM-DD'(BusinessDay)
// 또는 epoch 초(UTCTimestamp) 둘 다 받으므로 유니온으로 둔다.
// volume 은 histogram 오버레이 전용. 값이 있는 봉만 그린다 — 결측 봉은 자연 스킵.
export type ChartBar = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};
