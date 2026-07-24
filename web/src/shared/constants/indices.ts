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

const META_BY_CODE = Object.fromEntries(
  INDEX_REGISTRY.map((m) => [m.code, m]),
) as Record<IndexCode, IndexEntry>;

export const getIndexMeta = (code: IndexCode): IndexEntry => META_BY_CODE[code];

export const INDEX_LABEL: Record<IndexCode, string> = Object.fromEntries(
  INDEX_REGISTRY.map((m) => [m.code, m.label]),
) as Record<IndexCode, string>;
