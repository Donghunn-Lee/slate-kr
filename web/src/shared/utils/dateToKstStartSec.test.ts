import { describe, it, expect } from "vitest";
import { dateToKstStartSec } from "./dateToKstStartSec";

// KST 시각을 fake-utc epoch sec 로 인코딩 (kis-quote-fetch 의 kstToFakeUtcSec 와 동형).
// 테스트에서는 서버 모듈 의존 피해 로컬 helper 로 재구현.
const fakeUtcSec = (yyyyMmDd: string, hhmm: string): number => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const h = Number(hhmm.slice(0, 2));
  const min = Number(hhmm.slice(2, 4));
  return Math.floor(Date.UTC(y, m - 1, d, h, min) / 1000);
};

describe("dateToKstStartSec", () => {
  it("KST 자정을 fake-UTC epoch 초로 인코딩한다", () => {
    expect(dateToKstStartSec("2026-07-29")).toBe(Date.UTC(2026, 6, 29) / 1000);
  });

  it("자정 경계: 전일 마지막 분봉 < 경계 <= 당일 봉", () => {
    const boundary = dateToKstStartSec("2026-07-29");
    expect(fakeUtcSec("2026-07-28", "2359")).toBeLessThan(boundary);
    expect(fakeUtcSec("2026-07-29", "0000")).toBe(boundary);
    expect(fakeUtcSec("2026-07-29", "0900")).toBeGreaterThan(boundary);
  });

  it("전일 NXT 애프터마켓(20시대) 봉은 당일 경계보다 앞선다", () => {
    expect(fakeUtcSec("2026-07-28", "2000")).toBeLessThan(
      dateToKstStartSec("2026-07-29"),
    );
  });

  it("연속한 날짜는 정확히 하루(86400초) 차이다 — 연·월 경계 포함", () => {
    expect(
      dateToKstStartSec("2026-01-01") - dateToKstStartSec("2025-12-31"),
    ).toBe(86_400);
    expect(
      dateToKstStartSec("2026-03-01") - dateToKstStartSec("2026-02-28"),
    ).toBe(86_400);
  });

  it("로컬 타임존과 무관하게 캘린더 날짜만으로 결정된다", () => {
    expect(dateToKstStartSec("2026-03-01")).toBe(Date.UTC(2026, 2, 1) / 1000);
  });
});
