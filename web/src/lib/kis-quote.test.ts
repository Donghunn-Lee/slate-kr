import { describe, it, expect } from "vitest";
import { normalizeStockQuote, parseMarketAction } from "./kis-quote";

// KIS FHKST01010100 실응답 실측 픽스처. 필드 결측 · "N"/"Y" · "00"/"01" 표현 준수.
const FIXTURE_005930_NORMAL = {
  iscd_stat_cls_code: "55",
  stck_shrn_iscd: "005930",
  stck_prpr: "281500",
  prdy_vrss: "10500",
  prdy_ctrt: "3.87",
  prdy_vrss_sign: "2",
  stck_oprc: "267000",
  stck_hgpr: "285000",
  stck_lwpr: "266000",
  acml_vol: "27746471",
  temp_stop_yn: "N",
  invt_caful_yn: "N",
  mrkt_warn_cls_code: "00",
  short_over_yn: "N",
  sltr_yn: "N",
  mang_issu_cls_code: "N",
} as const;

const FIXTURE_230360_SHRUNK = {
  iscd_stat_cls_code: "00",
  stck_prpr: "0",
  prdy_vrss: "0",
  prdy_ctrt: "0.00",
  stck_oprc: "0",
  stck_hgpr: "0",
  stck_lwpr: "0",
  temp_stop_yn: "N",
  short_over_yn: "N",
  // mrkt_warn_cls_code / mang_issu_cls_code / sltr_yn / invt_caful_yn / stck_shrn_iscd 결측
} as const;

const FIXTURE_006200_MANAGED = {
  iscd_stat_cls_code: "51",
  stck_shrn_iscd: "006200",
  stck_prpr: "1877",
  prdy_vrss: "-33",
  prdy_ctrt: "-1.73",
  prdy_vrss_sign: "5",
  stck_oprc: "1908",
  stck_hgpr: "1908",
  stck_lwpr: "1809",
  acml_vol: "28623",
  temp_stop_yn: "N",
  invt_caful_yn: "N",
  mrkt_warn_cls_code: "00",
  short_over_yn: "N",
  sltr_yn: "N",
  mang_issu_cls_code: "Y",
} as const;

const FIXTURE_303030_CAUTION = {
  iscd_stat_cls_code: "54",
  stck_shrn_iscd: "303030",
  stck_prpr: "1994",
  prdy_vrss: "25",
  prdy_ctrt: "1.27",
  prdy_vrss_sign: "2",
  stck_oprc: "1969",
  stck_hgpr: "2045",
  stck_lwpr: "1932",
  acml_vol: "66924",
  temp_stop_yn: "N",
  invt_caful_yn: "N",
  mrkt_warn_cls_code: "01",
  short_over_yn: "N",
  sltr_yn: "N",
  mang_issu_cls_code: "N",
} as const;

const FIXTURE_012170_SUSPENDED = {
  iscd_stat_cls_code: "58",
  stck_shrn_iscd: "012170",
  stck_prpr: "748",
  prdy_vrss: "0",
  prdy_ctrt: "0.00",
  prdy_vrss_sign: "3",
  stck_oprc: "0",
  stck_hgpr: "0",
  stck_lwpr: "0",
  acml_vol: "0",
  temp_stop_yn: "N",
  invt_caful_yn: "N",
  mrkt_warn_cls_code: "00",
  short_over_yn: "N",
  sltr_yn: "N",
  mang_issu_cls_code: "Y", // 58+Y 중복 — 58 이 우선
} as const;

describe("parseMarketAction", () => {
  it("정상 종목(005930, iscd_stat=55, mrkt_warn=00, mang=N, sltr=N) → null", () => {
    expect(parseMarketAction(FIXTURE_005930_NORMAL)).toBeNull();
  });

  it("응답 축소(230360, prpr=0, mrkt_warn/mang/sltr 결측) → unavailable", () => {
    expect(parseMarketAction(FIXTURE_230360_SHRUNK)).toEqual({
      kind: "unavailable",
    });
  });

  it("관리종목(006200, iscd_stat=51, mang=Y) → managed", () => {
    expect(parseMarketAction(FIXTURE_006200_MANAGED)).toEqual({ kind: "managed" });
  });

  it("투자주의(303030, mrkt_warn=01) → caution", () => {
    expect(parseMarketAction(FIXTURE_303030_CAUTION)).toEqual({ kind: "caution" });
  });

  it("거래정지(012170, iscd_stat=58, mang=Y 중복) → suspended (58 우선)", () => {
    expect(parseMarketAction(FIXTURE_012170_SUSPENDED)).toEqual({
      kind: "suspended",
    });
  });

  it("정리매매(sltr_yn=Y) → liquidation (58 아니면 sltr 이 mang 보다 우선)", () => {
    expect(
      parseMarketAction({ ...FIXTURE_006200_MANAGED, sltr_yn: "Y" }),
    ).toEqual({ kind: "liquidation" });
  });

  it("단기과열(iscd_stat=59) → overheated", () => {
    expect(
      parseMarketAction({ ...FIXTURE_005930_NORMAL, iscd_stat_cls_code: "59" }),
    ).toEqual({ kind: "overheated" });
  });

  it("mrkt_warn=02 → warning", () => {
    expect(
      parseMarketAction({ ...FIXTURE_005930_NORMAL, mrkt_warn_cls_code: "02" }),
    ).toEqual({ kind: "warning" });
  });

  it("mrkt_warn=03 → risk", () => {
    expect(
      parseMarketAction({ ...FIXTURE_005930_NORMAL, mrkt_warn_cls_code: "03" }),
    ).toEqual({ kind: "risk" });
  });

  it("iscd_stat=51 단독(mang=N) → null (51 은 판정에 사용하지 않음)", () => {
    expect(
      parseMarketAction({
        ...FIXTURE_005930_NORMAL,
        iscd_stat_cls_code: "51",
        mang_issu_cls_code: "N",
      }),
    ).toEqual(null);
  });

  it("prpr=0 이지만 조치 필드 존재 → unavailable 아님", () => {
    expect(
      parseMarketAction({
        ...FIXTURE_005930_NORMAL,
        stck_prpr: "0",
      }),
    ).toBeNull();
  });

  it("null 입력 → null", () => {
    expect(parseMarketAction(null)).toBeNull();
  });

  it("빈 객체 → null (조치 필드 · prpr 전부 없음)", () => {
    expect(parseMarketAction({})).toBeNull();
  });

  it("58 우선순위 > sltr > mang > 59 > mrkt_warn: 전부 세팅해도 suspended 만", () => {
    expect(
      parseMarketAction({
        iscd_stat_cls_code: "58",
        sltr_yn: "Y",
        mang_issu_cls_code: "Y",
        mrkt_warn_cls_code: "03",
      }),
    ).toEqual({ kind: "suspended" });
  });
});

describe("normalizeStockQuote — 폴링 가드", () => {
  it("정상 quote → StockQuote", () => {
    const result = normalizeStockQuote(FIXTURE_005930_NORMAL);
    expect(result).not.toBeNull();
    expect(result?.ticker).toBe("005930");
    expect(result?.price).toBe(281500);
  });

  it("prpr=0 (KIS 정지 종목 반환 케이스) → null (EOD 덮어쓰기 방지)", () => {
    const result = normalizeStockQuote({
      ...FIXTURE_005930_NORMAL,
      stck_prpr: "0",
    });
    expect(result).toBeNull();
  });

  it("prpr 음수 (이례적 오염) → null", () => {
    const result = normalizeStockQuote({
      ...FIXTURE_005930_NORMAL,
      stck_prpr: "-1",
    });
    expect(result).toBeNull();
  });

  it("응답 축소(230360, stck_shrn_iscd 결측) → null (기존 safeParse 실패 경로)", () => {
    expect(normalizeStockQuote(FIXTURE_230360_SHRUNK)).toBeNull();
  });

  it("012170 (iscd_stat=58, prpr=748) → 정상 정규화 (guard 는 prpr>0 만 통과)", () => {
    const result = normalizeStockQuote(FIXTURE_012170_SUSPENDED);
    expect(result).not.toBeNull();
    expect(result?.price).toBe(748);
  });
});
