import { describe, it, expect } from "vitest";
import type { IndexQuote } from "@/shared/types/quote";
import {
  demoteInvalidOverseasQuote,
  parseHeadTime,
} from "./kis-overseas-quote-fetch";

const makeQuote = (price: number): IndexQuote => ({
  name: "test",
  price,
  change: 0,
  changeRate: 0,
  sign: "flat",
  open: price,
  high: price,
  low: price,
  advCount: 0,
  declCount: 0,
  time: null,
});

describe("parseHeadTime", () => {
  it("output2 head 정상 → {date, hour} 문자열 그대로", () => {
    expect(
      parseHeadTime([
        { stck_bsop_date: "20260818", stck_cntg_hour: "163800", optn_prpr: "7691.76" },
        { stck_bsop_date: "20260818", stck_cntg_hour: "162000" },
      ]),
    ).toEqual({ date: "20260818", hour: "163800" });
  });

  it("output2 = [] (.DJI 케이스) → null", () => {
    expect(parseHeadTime([])).toBeNull();
  });

  it("output2 undefined → null", () => {
    expect(parseHeadTime(undefined)).toBeNull();
  });

  it("output2 배열 아님 → null (스키마 이탈 방어)", () => {
    expect(parseHeadTime({ not: "array" })).toBeNull();
  });

  it("head hour 가 마커(999999) → null", () => {
    expect(
      parseHeadTime([
        { stck_bsop_date: "20260818", stck_cntg_hour: "999999" },
      ]),
    ).toBeNull();
  });

  it("head hour 가 마커(888888) → null", () => {
    expect(
      parseHeadTime([
        { stck_bsop_date: "20260818", stck_cntg_hour: "888888" },
      ]),
    ).toBeNull();
  });

  it("head 필드 부재 → null", () => {
    expect(parseHeadTime([{ optn_prpr: "7691.76" }])).toBeNull();
  });
});

describe("demoteInvalidOverseasQuote", () => {
  it("price > 0 → 원본 quote 그대로", () => {
    const q = makeQuote(7691.76);
    expect(demoteInvalidOverseasQuote(q)).toBe(q);
  });

  it("price = 0 (.DJI 회귀 케이스) → null 강등", () => {
    expect(demoteInvalidOverseasQuote(makeQuote(0))).toBeNull();
  });

  it("price < 0 (파싱 이상치) → null 강등", () => {
    expect(demoteInvalidOverseasQuote(makeQuote(-1))).toBeNull();
  });
});
