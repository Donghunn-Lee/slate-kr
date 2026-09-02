import { describe, it, expect } from "vitest";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import { isKrxHoliday } from "./krxHolidays";

describe("isKrxHoliday", () => {
  it("캘린더 없음 → 정적 표 (2026-09-24 추석) true", () => {
    expect(isKrxHoliday("2026-09-24")).toBe(true);
  });

  it("캘린더 없음 → 정적 표 (2026-09-25 추석) true", () => {
    expect(isKrxHoliday("2026-09-25")).toBe(true);
  });

  it("캘린더 없음 → 정적 표에 없는 평일 → false", () => {
    expect(isKrxHoliday("2026-09-01")).toBe(false);
  });

  it("캘린더 KRX closed (정적 표에 없는 임시공휴일) → true", () => {
    const cal: MarketCalendar = { KRX: { "2026-09-01": false } };
    expect(isKrxHoliday("2026-09-01", cal)).toBe(true);
  });

  it("캘린더 KRX open (정적 표 휴장일이 실제로는 개장) → false", () => {
    // 캘린더 값이 정적 표를 이긴다 — collector 데이터가 정본.
    const cal: MarketCalendar = { KRX: { "2026-09-24": true } };
    expect(isKrxHoliday("2026-09-24", cal)).toBe(false);
  });

  it("다른 시장 행만 있음 → 해당 KRX 일자는 정적 표 폴백", () => {
    const cal: MarketCalendar = { US: { "2026-09-24": true } };
    expect(isKrxHoliday("2026-09-24", cal)).toBe(true);
  });

  it("캘린더 KRX 존재하지만 조회 일자가 없으면 정적 표 폴백", () => {
    const cal: MarketCalendar = { KRX: { "2026-09-01": true } };
    expect(isKrxHoliday("2026-09-24", cal)).toBe(true);
    expect(isKrxHoliday("2026-08-15", cal)).toBe(false);
  });
});
