import { describe, it, expect } from "vitest";
import { normalizeRow } from "./kis-ranking-fetch";
import type { MarketRankingKind } from "@/shared/types/ranking";

// 픽스처는 실 KIS 응답 상위 3행에서 발췌.

const FLUCTUATION_KIND: MarketRankingKind = {
  kind: "fluctuation",
  direction: "up",
  market: "all",
};

const VOLUME_KIND: MarketRankingKind = {
  kind: "volume",
  by: "value",
  market: "all",
};

const MCAP_KIND: MarketRankingKind = { kind: "market-cap", market: "all" };
const INTEREST_KIND: MarketRankingKind = { kind: "top-interest", market: "all" };

describe("normalizeRow — fluctuation", () => {
  it("정상 row 매핑 (marketCap·interestCount 미포함)", () => {
    const raw = {
      stck_shrn_iscd: "005930",
      hts_kor_isnm: "삼성전자",
      stck_prpr: "246000",
      prdy_vrss: "-4500",
      prdy_ctrt: "-1.80",
      prdy_vrss_sign: "5",
      data_rank: "1",
      acml_vol: "9627948",
    };
    const item = normalizeRow(raw, FLUCTUATION_KIND);
    expect(item).toEqual({
      ticker: "005930",
      name: "삼성전자",
      price: 246000,
      change: -4500,
      changePct: -1.8,
      changeSign: "5",
      rank: 1,
      volume: 9627948,
    });
    expect(item).not.toHaveProperty("marketCap");
    expect(item).not.toHaveProperty("interestCount");
  });

  it("필수 필드 누락 → null", () => {
    expect(normalizeRow({ hts_kor_isnm: "X" }, FLUCTUATION_KIND)).toBeNull();
  });
});

describe("normalizeRow — volume", () => {
  it("정상 row 매핑 (marketCap·interestCount 미포함)", () => {
    const raw = {
      mksc_shrn_iscd: "005930",
      hts_kor_isnm: "삼성전자",
      stck_prpr: "246000",
      prdy_vrss: "-4500",
      prdy_ctrt: "-1.80",
      prdy_vrss_sign: "5",
      data_rank: "1",
      acml_vol: "9627948",
      acml_tr_pbmn: "2427662429750",
    };
    const item = normalizeRow(raw, VOLUME_KIND);
    expect(item?.tradeValue).toBe(2427662429750);
    expect(item).not.toHaveProperty("marketCap");
    expect(item).not.toHaveProperty("interestCount");
  });

  it("필수 필드 누락 → null", () => {
    expect(normalizeRow({ mksc_shrn_iscd: "005930" }, VOLUME_KIND)).toBeNull();
  });
});

describe("normalizeRow — market-cap", () => {
  const rows = [
    {
      mksc_shrn_iscd: "005930",
      data_rank: "1",
      hts_kor_isnm: "삼성전자",
      stck_prpr: "247000",
      prdy_vrss: "-3500",
      prdy_vrss_sign: "5",
      prdy_ctrt: "-1.40",
      acml_vol: "10976676",
      lstn_stcn: "5846278608",
      stck_avls: "14440308",
      mrkt_whol_avls_rlim: "23.05",
    },
    {
      mksc_shrn_iscd: "000660",
      data_rank: "2",
      hts_kor_isnm: "SK하이닉스",
      stck_prpr: "1585000",
      prdy_vrss: "-28000",
      prdy_vrss_sign: "5",
      prdy_ctrt: "-1.74",
      acml_vol: "2072170",
      lstn_stcn: "730492365",
      stck_avls: "11578304",
      mrkt_whol_avls_rlim: "18.48",
    },
    {
      mksc_shrn_iscd: "005935",
      data_rank: "3",
      hts_kor_isnm: "삼성전자우",
      stck_prpr: "182600",
      prdy_vrss: "-2900",
      prdy_vrss_sign: "5",
      prdy_ctrt: "-1.56",
      acml_vol: "1504567",
      lstn_stcn: "802371203",
      stck_avls: "1465130",
      mrkt_whol_avls_rlim: "2.34",
    },
  ];

  it("상위 3행 도메인 매핑 (marketCap 원 단위 환산, interestCount 미포함)", () => {
    const items = rows.map((r) => normalizeRow(r, MCAP_KIND));
    expect(items[0]).toEqual({
      ticker: "005930",
      name: "삼성전자",
      price: 247000,
      change: -3500,
      changePct: -1.4,
      changeSign: "5",
      rank: 1,
      volume: 10976676,
      marketCap: 14440308 * 100_000_000,
    });
    expect(items[0]).not.toHaveProperty("interestCount");
    expect(items[1]?.marketCap).toBe(11578304 * 100_000_000);
    expect(items[2]?.marketCap).toBe(1465130 * 100_000_000);
  });

  it("stck_avls 비정상 → marketCap 필드 생략 (다른 필드는 살아남음)", () => {
    const bad = { ...rows[0], stck_avls: "not-a-number" };
    const item = normalizeRow(bad, MCAP_KIND);
    expect(item).not.toBeNull();
    expect(item).not.toHaveProperty("marketCap");
    expect(item?.ticker).toBe("005930");
  });

  it("mksc_shrn_iscd 누락 → row 전체 null", () => {
    const bad: Record<string, unknown> = { ...rows[0] };
    delete bad.mksc_shrn_iscd;
    expect(normalizeRow(bad, MCAP_KIND)).toBeNull();
  });
});

describe("normalizeRow — top-interest", () => {
  const rows = [
    {
      mrkt_div_cls_name: "코스피",
      mksc_shrn_iscd: "005930",
      hts_kor_isnm: "삼성전자",
      stck_prpr: "246000",
      prdy_vrss: "-4500",
      prdy_vrss_sign: "5",
      prdy_ctrt: "-1.80",
      acml_vol: "9627948",
      acml_tr_pbmn: "2427662429750",
      askp: "246000",
      bidp: "245500",
      data_rank: "1",
      inter_issu_reg_csnu: "14644928",
    },
    {
      mrkt_div_cls_name: "코스피",
      mksc_shrn_iscd: "000660",
      hts_kor_isnm: "SK하이닉스",
      stck_prpr: "1574000",
      prdy_vrss: "-39000",
      prdy_vrss_sign: "5",
      prdy_ctrt: "-2.42",
      acml_vol: "1753422",
      acml_tr_pbmn: "2846578937500",
      askp: "1575000",
      bidp: "1574000",
      data_rank: "2",
      inter_issu_reg_csnu: "11782842",
    },
    {
      mrkt_div_cls_name: "코스피",
      mksc_shrn_iscd: "005935",
      hts_kor_isnm: "삼성전자우",
      stck_prpr: "181500",
      prdy_vrss: "-4000",
      prdy_vrss_sign: "5",
      prdy_ctrt: "-2.16",
      acml_vol: "1331194",
      acml_tr_pbmn: "246857639300",
      askp: "181400",
      bidp: "181200",
      data_rank: "3",
      inter_issu_reg_csnu: "1488399",
    },
  ];

  it("상위 3행 도메인 매핑 (interestCount·tradeValue 채움, marketCap 미포함)", () => {
    const items = rows.map((r) => normalizeRow(r, INTEREST_KIND));
    expect(items[0]).toEqual({
      ticker: "005930",
      name: "삼성전자",
      price: 246000,
      change: -4500,
      changePct: -1.8,
      changeSign: "5",
      rank: 1,
      volume: 9627948,
      tradeValue: 2427662429750,
      interestCount: 14644928,
    });
    expect(items[0]).not.toHaveProperty("marketCap");
    expect(items[1]?.interestCount).toBe(11782842);
    expect(items[2]?.interestCount).toBe(1488399);
  });

  it("inter_issu_reg_csnu 비정상 문자열 → interestCount 필드 생략 (row 는 살아남음)", () => {
    const bad = { ...rows[0], inter_issu_reg_csnu: "not-a-number" };
    const item = normalizeRow(bad, INTEREST_KIND);
    expect(item).not.toBeNull();
    expect(item).not.toHaveProperty("interestCount");
  });

  it("inter_issu_reg_csnu 필드 자체 누락 → row null", () => {
    const bad: Record<string, unknown> = { ...rows[0] };
    delete bad.inter_issu_reg_csnu;
    expect(normalizeRow(bad, INTEREST_KIND)).toBeNull();
  });
});
