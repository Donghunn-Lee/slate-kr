// Single source of truth for indices. `IndexCode`, `DomesticIndexCode`, `OverseasIndexCode`,
// `INDEX_LABEL`, region partitions, and getIndexMeta() all derive from INDEX_REGISTRY —
// do not maintain parallel lists elsewhere.

export type IndexRegion = "domestic" | "overseas";

type IndexMeta = {
  code: string;
  label: string;
  region: IndexRegion;
  // 한글 label 옆/아래에 병기하는 표준 심볼 sub 라벨. code(KIS 키) 와 다를 수 있다.
  overline: string;
};

export const INDEX_REGISTRY = [
  { code: "KOSPI", label: "코스피", region: "domestic", overline: "KOSPI" },
  { code: "KOSDAQ", label: "코스닥", region: "domestic", overline: "KOSDAQ" },
  { code: "KOSPI200", label: "코스피200", region: "domestic", overline: "KOSPI 200" },
  { code: "KOSDAQ150", label: "코스닥150", region: "domestic", overline: "KOSDAQ 150" },
  { code: "SPX", label: "S&P 500", region: "overseas", overline: "SPX" },
  { code: ".DJI", label: "다우존스", region: "overseas", overline: "DJI" },
  { code: "COMP", label: "나스닥종합", region: "overseas", overline: "IXIC" },
  { code: "NDX", label: "나스닥100", region: "overseas", overline: "NDX" },
  { code: "NI225", label: "니케이225", region: "overseas", overline: "N225" },
  { code: "HSI", label: "항셍", region: "overseas", overline: "HSI" },
  { code: "SHCOMP", label: "상해종합", region: "overseas", overline: "SHCOMP" },
  { code: "DAX", label: "DAX", region: "overseas", overline: "DAX" },
] as const satisfies readonly IndexMeta[];

type IndexEntry = (typeof INDEX_REGISTRY)[number];
type DomesticIndexEntry = Extract<IndexEntry, { region: "domestic" }>;
type OverseasIndexEntry = Extract<IndexEntry, { region: "overseas" }>;

export type IndexCode = IndexEntry["code"];
export type DomesticIndexCode = DomesticIndexEntry["code"];
export type OverseasIndexCode = OverseasIndexEntry["code"];

export const INDEX_CODES = INDEX_REGISTRY.map((m) => m.code) as readonly IndexCode[];

// 지수 페이지 SSR 시 index_daily_prices 에서 지수당 최근 N행만 실는다.
// 270 = 주봉 52개 완결분(52×5=260) + 첫 주 부분봉 여유 — 1Y 기본 뷰(day 250·week 52) 를 커버.
// 이보다 오래된 이력은 좌측 팬 트리거로 /api/index-daily 가 전량 서빙.
export const INDEX_DAILY_SSR_LIMIT = 270;

export const DOMESTIC_INDEX_CODES = INDEX_REGISTRY
  .filter((m): m is DomesticIndexEntry => m.region === "domestic")
  .map((m) => m.code) as readonly DomesticIndexCode[];

export const OVERSEAS_INDEX_CODES = INDEX_REGISTRY
  .filter((m): m is OverseasIndexEntry => m.region === "overseas")
  .map((m) => m.code) as readonly OverseasIndexCode[];

// intraday(1분봉·현재가) 를 지원하는 해외 지수 화이트리스트.
// .DJI 는 KIS intraday API 가 rt_cd=0 + 빈 배열을 돌려주므로 제외 — 이 목록에
// 없는 해외 지수는 IndexDetailPane 에서 daily-only 로 동작한다.
export const OVERSEAS_INTRADAY_CODES = [
  "SPX",
  "COMP",
  "NDX",
  "NI225",
  "HSI",
  "SHCOMP",
  "DAX",
] as const;
export type OverseasIntradayCode = (typeof OVERSEAS_INTRADAY_CODES)[number];

export const isOverseasIntradayCode = (
  code: string,
): code is OverseasIntradayCode =>
  (OVERSEAS_INTRADAY_CODES as readonly string[]).includes(code);

// 거래량 데이터 자체가 없는 지수 — daily/intraday 전 뷰에서 volume 축 렌더 금지.
// 근거(DB 전수 확인 2026-08-21): NDX 는 전 기간 volume=0,
// SPX 는 2015-01-30 이후 volume=0. KIS·백필 소스 모두 실값을 제공하지 않는다.
export const INDICES_WITHOUT_VOLUME: ReadonlySet<IndexCode> = new Set([
  "SPX",
  "NDX",
]);

// 해외 지수 → 거래소 IANA 타임존. KIS FHKST03030200 output2 는 현지 로컬 시각을
// 반환하므로 UTC 인스턴트 확정 후 KST 렌더에 이 매핑을 사용한다. DST 는 IANA DB
// 에 위임 (America/New_York 는 EST/EDT 자동 전환).
export const OVERSEAS_INDEX_TIMEZONE: Record<OverseasIndexCode, string> = {
  SPX: "America/New_York",
  ".DJI": "America/New_York",
  COMP: "America/New_York",
  NDX: "America/New_York",
  NI225: "Asia/Tokyo",
  HSI: "Asia/Hong_Kong",
  SHCOMP: "Asia/Shanghai",
  DAX: "Europe/Berlin",
};

// market-local 정규장 마감 시각 (HHMM). 체결시각 hour(HHMMSS) 앞 4자리와 문자열
// 비교로 live/closed 판정에 사용. 지수별 세션 판정(`getOverseasIndexSessionState`)
// 도 이 상수를 close 경계로 소비.
// 수용 리스크: 클로징 옥션(HSI 16:00~16:10 등)·미국 조기마감(연 4일)은 미반영.
export const OVERSEAS_INDEX_CLOSE_LOCAL: Record<OverseasIndexCode, string> = {
  SPX: "1600",
  ".DJI": "1600",
  COMP: "1600",
  NDX: "1600",
  NI225: "1530",
  HSI: "1600",
  SHCOMP: "1500",
  DAX: "1730",
};

// market-local 정규장 개장 시각 (HHMM). `getOverseasIndexSessionState` 가 open 경계로
// 소비. 점심 휴장(HSI 12:00~13:00 · SHCOMP 11:30~13:00)은 모델링하지 않음 —
// [open, close) 를 regular 로 취급 (KIS 응답이 점심 구간 봉을 어차피 반환하지 않음).
export const OVERSEAS_INDEX_OPEN_LOCAL: Record<OverseasIndexCode, string> = {
  SPX: "0930",
  ".DJI": "0930",
  COMP: "0930",
  NDX: "0930",
  NI225: "0900",
  HSI: "0930",
  SHCOMP: "0930",
  DAX: "0900",
};

// quote 라이브 지연(분). 0 = 실시간, 양수 = 지연 분.
// live 상태에서 dot(실시간 신호) vs pill 배지(지연) 렌더 결정의 단일 입력.
// .DJI 는 quote.time 이 항상 null 이라 live 상태로 진입하지 않아 이 매핑을 참조하지 않는다.
export const OVERSEAS_INDEX_DELAY_MIN: Partial<Record<OverseasIndexCode, number>> = {
  SPX: 0,
  COMP: 0,
  NDX: 0,
  NI225: 15,
  HSI: 15,
  SHCOMP: 15,
  DAX: 15,
};

const META_BY_CODE = Object.fromEntries(
  INDEX_REGISTRY.map((m) => [m.code, m]),
) as Record<IndexCode, IndexEntry>;

export const getIndexMeta = (code: IndexCode): IndexEntry => META_BY_CODE[code];

export const INDEX_LABEL: Record<IndexCode, string> = Object.fromEntries(
  INDEX_REGISTRY.map((m) => [m.code, m.label]),
) as Record<IndexCode, string>;
