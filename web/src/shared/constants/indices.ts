// Single source of truth for indices. `IndexCode`, `DomesticIndexCode`, `OverseasIndexCode`,
// `INDEX_LABEL`, region partitions, and getIndexMeta() all derive from INDEX_REGISTRY —
// do not maintain parallel lists elsewhere.

export type IndexRegion = "domestic" | "overseas";

type IndexMeta = {
  code: string;
  label: string;
  region: IndexRegion;
  // 요약행 상단 overline (텍스처용 영문 라벨). 정보가 아니라 시각 리듬.
  overline: string;
};

export const INDEX_REGISTRY = [
  { code: "KOSPI", label: "코스피", region: "domestic", overline: "KOSPI" },
  { code: "KOSDAQ", label: "코스닥", region: "domestic", overline: "KOSDAQ" },
  { code: "KOSPI200", label: "코스피200", region: "domestic", overline: "KOSPI 200" },
  { code: "KOSDAQ150", label: "코스닥150", region: "domestic", overline: "KOSDAQ 150" },
  { code: "SPX", label: "S&P 500", region: "overseas", overline: "S&P 500" },
  { code: ".DJI", label: "다우존스", region: "overseas", overline: "DOW JONES" },
  { code: "COMP", label: "나스닥종합", region: "overseas", overline: "NASDAQ COMP" },
  { code: "NDX", label: "나스닥100", region: "overseas", overline: "NASDAQ 100" },
  { code: "NI225", label: "니케이225", region: "overseas", overline: "NIKKEI 225" },
  { code: "HSI", label: "항셍", region: "overseas", overline: "HANG SENG" },
  { code: "SHCOMP", label: "상해종합", region: "overseas", overline: "SSE COMPOSITE" },
  { code: "DAX", label: "DAX", region: "overseas", overline: "DAX" },
] as const satisfies readonly IndexMeta[];

type IndexEntry = (typeof INDEX_REGISTRY)[number];
type DomesticIndexEntry = Extract<IndexEntry, { region: "domestic" }>;
type OverseasIndexEntry = Extract<IndexEntry, { region: "overseas" }>;

export type IndexCode = IndexEntry["code"];
export type DomesticIndexCode = DomesticIndexEntry["code"];
export type OverseasIndexCode = OverseasIndexEntry["code"];

export const INDEX_CODES = INDEX_REGISTRY.map((m) => m.code) as readonly IndexCode[];

export const DOMESTIC_INDEX_CODES = INDEX_REGISTRY
  .filter((m): m is DomesticIndexEntry => m.region === "domestic")
  .map((m) => m.code) as readonly DomesticIndexCode[];

export const OVERSEAS_INDEX_CODES = INDEX_REGISTRY
  .filter((m): m is OverseasIndexEntry => m.region === "overseas")
  .map((m) => m.code) as readonly OverseasIndexCode[];

// intraday(1분봉·현재가) 를 지원하는 해외 지수 화이트리스트.
// .DJI 는 KIS intraday API 가 rt_cd=0 + 빈 배열을 돌려주므로 제외 — 이 목록에
// 없는 해외 지수는 IndexDetailPane 에서 daily-only 로 동작한다.
export const OVERSEAS_INTRADAY_CODES = ["SPX", "COMP", "NDX"] as const;
export type OverseasIntradayCode = (typeof OVERSEAS_INTRADAY_CODES)[number];

export const isOverseasIntradayCode = (
  code: string,
): code is OverseasIntradayCode =>
  (OVERSEAS_INTRADAY_CODES as readonly string[]).includes(code);

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
// 비교로 live/closed 판정에만 사용 — 여기에 세션 개장·리셋 시각을 함께 넣지 말 것
// (해외 헤더 라벨은 hour < close 로 자동 해제, 별도 open 상수 불필요).
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
