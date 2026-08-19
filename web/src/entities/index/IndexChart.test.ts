import { describe, it, expect } from "vitest";
import type { IndexQuote } from "@/shared/types/quote";
import { overseasQuoteMergeDate } from "./IndexChart";

const quote = (
  timeDate: string | null,
  timeHour = "093000",
): IndexQuote => ({
  name: "test",
  price: 100,
  change: 0,
  changeRate: 0,
  sign: "flat",
  open: 100,
  high: 100,
  low: 100,
  advCount: 0,
  declCount: 0,
  time: timeDate === null ? null : { date: timeDate, hour: timeHour },
});

describe("overseasQuoteMergeDate", () => {
  it("quote null → undefined", () => {
    expect(overseasQuoteMergeDate(null, "2026-08-18")).toBeUndefined();
  });

  it("time null (.DJI 시나리오) → undefined", () => {
    expect(overseasQuoteMergeDate(quote(null), "2026-08-18")).toBeUndefined();
  });

  it("latestDailyDate null (EOD 빈 배열) → undefined", () => {
    expect(overseasQuoteMergeDate(quote("20260819"), null)).toBeUndefined();
  });

  it("게이트 성립 (quote date > latest daily) → 변환된 YYYY-MM-DD", () => {
    expect(overseasQuoteMergeDate(quote("20260819"), "2026-08-18")).toBe(
      "2026-08-19",
    );
  });

  it("게이트 불성립 (동일 date) → undefined (EOD 이중 삽입 방지)", () => {
    expect(overseasQuoteMergeDate(quote("20260818"), "2026-08-18")).toBeUndefined();
  });

  it("게이트 불성립 (quote date < latest daily) → undefined", () => {
    expect(overseasQuoteMergeDate(quote("20260817"), "2026-08-18")).toBeUndefined();
  });

  it("date length 비정상 → undefined (안전 폴백)", () => {
    expect(overseasQuoteMergeDate(quote("2026081"), "2026-08-18")).toBeUndefined();
    expect(overseasQuoteMergeDate(quote(""), "2026-08-18")).toBeUndefined();
  });

  it("연/월 경계 (문자열 사전순 비교 안전성 확인)", () => {
    expect(overseasQuoteMergeDate(quote("20270101"), "2026-12-31")).toBe(
      "2027-01-01",
    );
    expect(overseasQuoteMergeDate(quote("20260901"), "2026-08-31")).toBe(
      "2026-09-01",
    );
  });
});
