export const INDEX_CODES = ["KOSPI", "KOSDAQ", "KOSPI200"] as const;
export type IndexCode = (typeof INDEX_CODES)[number];
export const INDEX_LABEL: Record<IndexCode, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  KOSPI200: "코스피200",
};
