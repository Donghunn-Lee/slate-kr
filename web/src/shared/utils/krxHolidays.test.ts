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

const countTradingDays = (year: number): number => {
  let count = 0;
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86_400_000) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !isKrxHoliday(d.toISOString().slice(0, 10))) count++;
  }
  return count;
};

describe("정적 표 연도별 거래일 수 (평일 − 휴장)", () => {
  // 기대값 = 보관 KOSPI 일봉의 연도별 봉 수 — 표가 실거래일에서 추출됐다는 근거
  it.each([
    [2015, 248],
    [2016, 246],
    [2017, 243],
    [2018, 244],
    [2019, 246],
    [2020, 248],
    [2021, 248],
    [2022, 246],
    [2023, 245],
  ])("%i년 → %i일", (year, expected) => {
    expect(countTradingDays(year)).toBe(expected);
  });
});
