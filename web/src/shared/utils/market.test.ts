import { describe, it, expect } from "vitest";
import {
  getKrxSessionState,
  getUsSessionState,
  getEtDateAndMinutes,
  getUsTradingDate,
  getPreviousUsTradingDate,
  isKrxEarlyPreopen,
  isKrxLatePreopen,
  isUsMarketOpen,
} from "./market";

// Date 생성 헬퍼 — 명시적 UTC epoch 를 통해 ET 로컬 시각을 유도한다.
// EDT(3~11월) = UTC-4 · EST(11~3월) = UTC-5.
const utc = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h, min));

describe("getUsSessionState", () => {
  it("EDT 정규장 중 (2026-07-23 목 15:00 UTC → 11:00 ET) → regular", () => {
    expect(getUsSessionState(utc(2026, 7, 23, 15, 0))).toBe("regular");
  });

  it("EDT 정규장 시작 경계 (13:30 UTC → 09:30 ET) → regular", () => {
    expect(getUsSessionState(utc(2026, 7, 23, 13, 30))).toBe("regular");
  });

  it("EDT 정규장 종료 경계 (20:00 UTC → 16:00 ET) → closed (16:00 미포함)", () => {
    expect(getUsSessionState(utc(2026, 7, 23, 20, 0))).toBe("closed");
  });

  it("EDT 정규장 시작 직전 (13:29 UTC → 09:29 ET) → closed", () => {
    expect(getUsSessionState(utc(2026, 7, 23, 13, 29))).toBe("closed");
  });

  it("EST 정규장 중 (2026-12-15 화 15:00 UTC → 10:00 ET) → regular", () => {
    expect(getUsSessionState(utc(2026, 12, 15, 15, 0))).toBe("regular");
  });

  it("EST 정규장 시작 경계 (14:30 UTC → 09:30 ET) → regular", () => {
    expect(getUsSessionState(utc(2026, 12, 15, 14, 30))).toBe("regular");
  });

  it("EST 정규장 종료 경계 (21:00 UTC → 16:00 ET) → closed", () => {
    expect(getUsSessionState(utc(2026, 12, 15, 21, 0))).toBe("closed");
  });

  it("주말 (토요일 EDT 15:00 UTC) → closed", () => {
    expect(getUsSessionState(utc(2026, 7, 25, 15, 0))).toBe("closed");
  });

  it("주말 (일요일 EDT 15:00 UTC) → closed", () => {
    expect(getUsSessionState(utc(2026, 7, 26, 15, 0))).toBe("closed");
  });

  it("휴장일 Independence Day observed (2026-07-03 EDT 15:00 UTC) → closed", () => {
    expect(getUsSessionState(utc(2026, 7, 3, 15, 0))).toBe("closed");
  });

  it("휴장일 MLK Day (2026-01-19 EST 15:00 UTC) → closed", () => {
    expect(getUsSessionState(utc(2026, 1, 19, 15, 0))).toBe("closed");
  });
});

describe("isUsMarketOpen", () => {
  it("정규장 → true", () => {
    expect(isUsMarketOpen(utc(2026, 7, 23, 15, 0))).toBe(true);
  });
  it("폐장 → false", () => {
    expect(isUsMarketOpen(utc(2026, 7, 23, 4, 0))).toBe(false);
  });
});

describe("getEtDateAndMinutes", () => {
  it("EDT: 2026-07-23 04:00 UTC = 2026-07-23 00:00 ET (자정)", () => {
    const r = getEtDateAndMinutes(utc(2026, 7, 23, 4, 0));
    expect(r.date).toBe("2026-07-23");
    expect(r.minutes).toBe(0);
  });

  it("EDT: 2026-07-23 03:59 UTC = 2026-07-22 23:59 ET (전날)", () => {
    const r = getEtDateAndMinutes(utc(2026, 7, 23, 3, 59));
    expect(r.date).toBe("2026-07-22");
    expect(r.minutes).toBe(23 * 60 + 59);
  });

  it("EST: 2026-12-15 05:00 UTC = 2026-12-15 00:00 ET", () => {
    const r = getEtDateAndMinutes(utc(2026, 12, 15, 5, 0));
    expect(r.date).toBe("2026-12-15");
    expect(r.minutes).toBe(0);
  });
});

describe("getUsTradingDate", () => {
  it("EDT 정규장 중 → 오늘 ET", () => {
    expect(getUsTradingDate(utc(2026, 7, 23, 15, 0))).toBe("2026-07-23");
  });

  it("EDT 개장 전 (12:00 UTC = 08:00 ET) → 직전 거래일", () => {
    expect(getUsTradingDate(utc(2026, 7, 23, 12, 0))).toBe("2026-07-22");
  });

  it("EDT 마감 후 (21:00 UTC = 17:00 ET) → 오늘 (직전 거래일)", () => {
    // 세션 종료 후엔 오늘의 마감된 세션이 최신 완결일. getUsTradingDate 구현은
    // regular 아니면 findRecent(shift(-1)) 이므로 어제로 fallback — 이는 KRX 관례와
    // 대칭 (다음 세션 개장 전까지 어제 세션이 최신 완결값으로 노출).
    expect(getUsTradingDate(utc(2026, 7, 23, 21, 0))).toBe("2026-07-22");
  });

  it("일요일 → 직전 금요일", () => {
    expect(getUsTradingDate(utc(2026, 7, 26, 15, 0))).toBe("2026-07-24");
  });

  it("휴장일 (Independence Day observed 7/3) 정규장 시간대 → 직전 거래일 (7/2)", () => {
    expect(getUsTradingDate(utc(2026, 7, 3, 15, 0))).toBe("2026-07-02");
  });
});

describe("getPreviousUsTradingDate", () => {
  it("금요일 → 목요일", () => {
    expect(getPreviousUsTradingDate("2026-07-24")).toBe("2026-07-23");
  });
  it("월요일 → 금요일 (주말 스킵)", () => {
    expect(getPreviousUsTradingDate("2026-07-27")).toBe("2026-07-24");
  });
  it("휴장일 다음날 (7/6 월) → 7/2 목 (7/3 관측 휴장 + 7/4~5 주말 스킵)", () => {
    expect(getPreviousUsTradingDate("2026-07-06")).toBe("2026-07-02");
  });
});

// KRX preopen 세분화 — fetchStockIntradayChart 의 fallback 분기 게이트.
// KST = UTC+9. 06:00 KST = 21:00 UTC 전일.
const kst = (
  y: number, m: number, d: number, h: number, min = 0,
): Date => new Date(Date.UTC(y, m - 1, d, h - 9, min));

describe("isKrxEarlyPreopen", () => {
  it("06:00 KST 거래일 → true (창 시작 경계 포함)", () => {
    expect(isKrxEarlyPreopen(kst(2026, 7, 23, 6, 0))).toBe(true);
  });
  it("07:59 KST → true", () => {
    expect(isKrxEarlyPreopen(kst(2026, 7, 23, 7, 59))).toBe(true);
  });
  it("08:00 KST → false (pre 세션 진입)", () => {
    expect(isKrxEarlyPreopen(kst(2026, 7, 23, 8, 0))).toBe(false);
  });
  it("08:50 KST → false (늦은 preopen, 아침이 아님)", () => {
    expect(isKrxEarlyPreopen(kst(2026, 7, 23, 8, 50))).toBe(false);
  });
  it("05:00 KST → false (session=after_close, preopen 아님)", () => {
    expect(getKrxSessionState(kst(2026, 7, 23, 5, 0))).toBe("after_close");
    expect(isKrxEarlyPreopen(kst(2026, 7, 23, 5, 0))).toBe(false);
  });
  it("일요일 07:00 KST → false (주말=closed)", () => {
    expect(isKrxEarlyPreopen(kst(2026, 7, 26, 7, 0))).toBe(false);
  });
});

describe("isKrxLatePreopen", () => {
  it("08:50 KST → true (창 시작 경계 포함)", () => {
    expect(isKrxLatePreopen(kst(2026, 7, 23, 8, 50))).toBe(true);
  });
  it("08:59 KST → true", () => {
    expect(isKrxLatePreopen(kst(2026, 7, 23, 8, 59))).toBe(true);
  });
  it("09:00 KST → false (정규장 진입)", () => {
    expect(isKrxLatePreopen(kst(2026, 7, 23, 9, 0))).toBe(false);
  });
  it("08:00 KST → false (pre 세션, 늦은 preopen 아님)", () => {
    expect(isKrxLatePreopen(kst(2026, 7, 23, 8, 0))).toBe(false);
  });
  it("07:00 KST → false (아침 preopen 이지 늦은 preopen 아님)", () => {
    expect(isKrxLatePreopen(kst(2026, 7, 23, 7, 0))).toBe(false);
  });
});
