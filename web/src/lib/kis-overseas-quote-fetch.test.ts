import { describe, it, expect } from "vitest";
import { parseHeadTime } from "./kis-overseas-quote-fetch";

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
