import { describe, it, expect } from "vitest";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
import {
  getKrxSessionState,
  getOverseasIndexSessionState,
  getOverseasIndexTradingDate,
  getPreviousOverseasIndexTradingDate,
  getUsSessionState,
  getEtDateAndMinutes,
  getUsTradingDate,
  getPreviousUsTradingDate,
  isKrxBeforeMarketOpen,
  isKrxEarlyPreopen,
  isKrxLatePreopen,
  isOverseasIndexHoliday,
  isUsMarketOpen,
  minutesSinceKrxClose,
  minutesSinceOverseasIndexClose,
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

// ── 해외 지수별 세션 (거래소 TZ) ─────────────────
// SPX 는 getUsSessionState 와 동치 검증. NI225·HSI·SHCOMP·DAX 는 각 로컬 마감/개장.
describe("getOverseasIndexSessionState", () => {
  it("SPX EDT 정규장 중 (2026-07-23 15:00 UTC → 11:00 ET) → regular", () => {
    expect(getOverseasIndexSessionState("SPX", utc(2026, 7, 23, 15, 0))).toBe(
      "regular",
    );
  });
  it("SPX EDT 개장 전 (12:00 UTC → 08:00 ET) → closed", () => {
    expect(getOverseasIndexSessionState("SPX", utc(2026, 7, 23, 12, 0))).toBe(
      "closed",
    );
  });
  it("SPX EDT 마감 후 (20:00 UTC → 16:00 ET) → closed (경계 미포함)", () => {
    expect(getOverseasIndexSessionState("SPX", utc(2026, 7, 23, 20, 0))).toBe(
      "closed",
    );
  });
  it("SPX 주말 (토요일 EDT 15:00 UTC) → closed", () => {
    expect(getOverseasIndexSessionState("SPX", utc(2026, 7, 25, 15, 0))).toBe(
      "closed",
    );
  });
  it("SPX EST 정규장 중 (2026-12-15 15:00 UTC → 10:00 ET) → regular", () => {
    expect(getOverseasIndexSessionState("SPX", utc(2026, 12, 15, 15, 0))).toBe(
      "regular",
    );
  });
  it("SPX EST 마감 후 (21:00 UTC → 16:00 ET) → closed", () => {
    expect(getOverseasIndexSessionState("SPX", utc(2026, 12, 15, 21, 0))).toBe(
      "closed",
    );
  });

  it("NI225 09:00 JST 개장 경계 (00:00 UTC = 09:00 JST) → regular", () => {
    // 2026-07-23 목요일 00:00 UTC = 09:00 JST
    expect(
      getOverseasIndexSessionState("NI225", utc(2026, 7, 23, 0, 0)),
    ).toBe("regular");
  });
  it("NI225 08:59 JST → closed (개장 직전)", () => {
    expect(
      getOverseasIndexSessionState("NI225", utc(2026, 7, 22, 23, 59)),
    ).toBe("closed");
  });
  it("NI225 15:30 JST 마감 경계 → closed (경계 미포함)", () => {
    expect(
      getOverseasIndexSessionState("NI225", utc(2026, 7, 23, 6, 30)),
    ).toBe("closed");
  });

  it("HSI 12:30 HKT 점심 시간 → regular (점심 휴장은 모델링하지 않음)", () => {
    // 2026-07-23 목요일 04:30 UTC = 12:30 HKT
    expect(getOverseasIndexSessionState("HSI", utc(2026, 7, 23, 4, 30))).toBe(
      "regular",
    );
  });

  it("DAX 17:29 CEST → regular (2026-08-28 = DST 기간)", () => {
    // CEST(UTC+2): 17:29 local = 15:29 UTC
    expect(getOverseasIndexSessionState("DAX", utc(2026, 8, 28, 15, 29))).toBe(
      "regular",
    );
  });
  it("DAX 17:31 CEST → closed (2026-08-28)", () => {
    expect(getOverseasIndexSessionState("DAX", utc(2026, 8, 28, 15, 31))).toBe(
      "closed",
    );
  });
  it("DAX 17:29 CET → regular (2026-01-15 = 비-DST)", () => {
    // CET(UTC+1): 17:29 local = 16:29 UTC
    expect(getOverseasIndexSessionState("DAX", utc(2026, 1, 15, 16, 29))).toBe(
      "regular",
    );
  });
});

describe("getOverseasIndexTradingDate", () => {
  it("SPX EDT 정규장 중 → 오늘 ET (getUsTradingDate 와 동치)", () => {
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 7, 23, 15, 0))).toBe(
      "2026-07-23",
    );
    expect(getUsTradingDate(utc(2026, 7, 23, 15, 0))).toBe("2026-07-23");
  });
  it("SPX EDT 개장 전 → 직전 거래일 (getUsTradingDate 와 동치, 휴장 캘린더 부재로 어제)", () => {
    // 개장 전 어제 = 7-22 (평일). getUsTradingDate 도 동일.
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 7, 23, 12, 0))).toBe(
      "2026-07-22",
    );
  });
  it("SPX 일요일 → 직전 금요일 (getUsTradingDate 와 동치)", () => {
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 7, 26, 15, 0))).toBe(
      "2026-07-24",
    );
    expect(getUsTradingDate(utc(2026, 7, 26, 15, 0))).toBe("2026-07-24");
  });

  it("NI225 월요일 08:30 JST (개장 전) → 직전 금요일", () => {
    // 2026-07-27 월요일 08:30 JST = 2026-07-26 23:30 UTC
    // 세션 아직 시작 전 → 어제(일)부터 역방향 → 금요일 7-24.
    expect(
      getOverseasIndexTradingDate("NI225", utc(2026, 7, 26, 23, 30)),
    ).toBe("2026-07-24");
  });
  it("DAX 일요일 → 직전 금요일", () => {
    expect(getOverseasIndexTradingDate("DAX", utc(2026, 7, 26, 12, 0))).toBe(
      "2026-07-24",
    );
  });

  // 마감 후~로컬 자정 사이는 당일 유지 — DB 창·세션 캐시 키가 세션 경계를 넘도록.
  it("SPX 월 04:00 ET (개장 전) → 직전 금요일", () => {
    // 2026-07-27 월 04:00 ET = 08:00 UTC. 개장 전 → 어제(일) 역방향 → 금(7-24).
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 7, 27, 8, 0))).toBe(
      "2026-07-24",
    );
  });
  it("SPX 월 12:00 ET (정규장 중) → 당일", () => {
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 7, 27, 16, 0))).toBe(
      "2026-07-27",
    );
  });
  it("SPX 월 17:00 ET (마감 후) → 당일", () => {
    // 2026-07-27 월 17:00 ET = 21:00 UTC. 마감(16:00) 후 → 로컬 당일 유지.
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 7, 27, 21, 0))).toBe(
      "2026-07-27",
    );
  });
  it("SPX 화 01:00 ET (다음날 새벽) → 직전 월요일", () => {
    // 2026-07-28 화 01:00 ET = 05:00 UTC. 개장 전 → 어제(월) 역방향 → 월(7-27).
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 7, 28, 5, 0))).toBe(
      "2026-07-27",
    );
  });
  it("SPX 토요일 → 직전 금요일", () => {
    // 2026-08-01 토 11:00 ET = 15:00 UTC. 주말 → minutesSinceClose=null → 어제부터 역방향.
    expect(getOverseasIndexTradingDate("SPX", utc(2026, 8, 1, 15, 0))).toBe(
      "2026-07-31",
    );
  });
  it("NI225 월 16:00 JST (마감 후) → 당일", () => {
    // 2026-07-27 월 16:00 JST = 07:00 UTC. close=15:30 → 마감 후 → 로컬 당일.
    expect(getOverseasIndexTradingDate("NI225", utc(2026, 7, 27, 7, 0))).toBe(
      "2026-07-27",
    );
  });
  it("DAX 월 18:00 CEST (마감 후) → 당일", () => {
    // 2026-07-27 월 18:00 Berlin (CEST=UTC+2) = 16:00 UTC. close=17:30 → 마감 후.
    expect(getOverseasIndexTradingDate("DAX", utc(2026, 7, 27, 16, 0))).toBe(
      "2026-07-27",
    );
  });
  it("DAX 화 01:00 CEST (다음날 새벽) → 직전 월요일", () => {
    // 2026-07-28 화 01:00 Berlin = 2026-07-27 23:00 UTC. 개장 전 → 어제(월) 역방향 → 월.
    expect(getOverseasIndexTradingDate("DAX", utc(2026, 7, 27, 23, 0))).toBe(
      "2026-07-27",
    );
  });
});

describe("getPreviousOverseasIndexTradingDate", () => {
  it("SPX 는 getPreviousUsTradingDate 와 동치 (일요일 → 금요일)", () => {
    expect(getPreviousOverseasIndexTradingDate("SPX", "2026-07-27")).toBe(
      getPreviousUsTradingDate("2026-07-27"),
    );
  });
  it("SPX 는 getPreviousUsTradingDate 와 동치 (휴장 반영: 7-6 → 7-2)", () => {
    expect(getPreviousOverseasIndexTradingDate("SPX", "2026-07-06")).toBe(
      getPreviousUsTradingDate("2026-07-06"),
    );
  });
  it("NI225 월요일 → 금요일 (아시아 휴장 캘린더 없음, 주말만 skip)", () => {
    expect(getPreviousOverseasIndexTradingDate("NI225", "2026-07-27")).toBe(
      "2026-07-24",
    );
  });
  it("DAX 화요일 → 월요일 (평일 연속)", () => {
    expect(getPreviousOverseasIndexTradingDate("DAX", "2026-07-28")).toBe(
      "2026-07-27",
    );
  });
});

// 정산 창 TTL 판정용 close-경과 헬퍼. null = 정산 창 대상 아님 → 3600s.
// 양수 = 당일 마감 후 경과 분 → 창 이내면 60s.
describe("minutesSinceKrxClose", () => {
  it("정규장 중 (14:00 KST) → null (아직 마감 전)", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 23, 14, 0))).toBeNull();
  });
  it("마감 경계 (15:30 KST) → 0 (정산 창 시작)", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 23, 15, 30))).toBe(0);
  });
  it("마감 +5분 (15:35 KST) → 5 (창 이내)", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 23, 15, 35))).toBe(5);
  });
  it("마감 +14분 (15:44 KST) → 14 (창 경계)", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 23, 15, 44))).toBe(14);
  });
  it("마감 +15분 (15:45 KST) → 15 (창 밖 — 소비처가 < 15 로 판정)", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 23, 15, 45))).toBe(15);
  });
  it("마감 +4시간 (19:30 KST) → 240", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 23, 19, 30))).toBe(240);
  });
  it("자정 넘어 (다음날 03:00 KST) → null (당일 마감 없음)", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 24, 3, 0))).toBeNull();
  });
  it("토요일 정오 → null (주말)", () => {
    expect(minutesSinceKrxClose(kst(2026, 7, 25, 12, 0))).toBeNull();
  });
});

describe("minutesSinceOverseasIndexClose", () => {
  // NI225 15:30 JST 마감. JST(UTC+9) — 06:30 UTC 가 15:30 JST.
  it("NI225 정규장 중 (12:00 JST) → null", () => {
    expect(
      minutesSinceOverseasIndexClose("NI225", utc(2026, 7, 23, 3, 0)),
    ).toBeNull();
  });
  it("NI225 마감 +5분 (15:35 JST) → 5", () => {
    expect(
      minutesSinceOverseasIndexClose("NI225", utc(2026, 7, 23, 6, 35)),
    ).toBe(5);
  });
  it("NI225 마감 +44분 (16:14 JST) → 44 (창 경계 안)", () => {
    expect(
      minutesSinceOverseasIndexClose("NI225", utc(2026, 7, 23, 7, 14)),
    ).toBe(44);
  });
  it("NI225 마감 +45분 (16:15 JST) → 45 (창 밖)", () => {
    expect(
      minutesSinceOverseasIndexClose("NI225", utc(2026, 7, 23, 7, 15)),
    ).toBe(45);
  });
  it("NI225 토요일 → null (주말)", () => {
    expect(
      minutesSinceOverseasIndexClose("NI225", utc(2026, 7, 25, 7, 0)),
    ).toBeNull();
  });

  // SPX 16:00 ET 마감. EDT(UTC-4): 20:00 UTC. EST(UTC-5): 21:00 UTC.
  it("SPX EDT 마감 +5분 (16:05 ET) → 5 (2026-07-23)", () => {
    expect(
      minutesSinceOverseasIndexClose("SPX", utc(2026, 7, 23, 20, 5)),
    ).toBe(5);
  });
  it("SPX EDT 마감 +44분 → 44 (창 경계 안)", () => {
    expect(
      minutesSinceOverseasIndexClose("SPX", utc(2026, 7, 23, 20, 44)),
    ).toBe(44);
  });
  it("SPX EDT 마감 +45분 → 45 (창 밖)", () => {
    expect(
      minutesSinceOverseasIndexClose("SPX", utc(2026, 7, 23, 20, 45)),
    ).toBe(45);
  });
  it("SPX EDT 정규장 중 (11:00 ET) → null", () => {
    expect(
      minutesSinceOverseasIndexClose("SPX", utc(2026, 7, 23, 15, 0)),
    ).toBeNull();
  });
  it("SPX EST 마감 +5분 (16:05 ET, 2026-12-15) → 5 (DST 전환 대칭)", () => {
    expect(
      minutesSinceOverseasIndexClose("SPX", utc(2026, 12, 15, 21, 5)),
    ).toBe(5);
  });
});

// isOverseasIndexHoliday — 캘린더 우선순위 · 시장별 정적 폴백 (US NYSE / DE XETRA / JP·HK·CN 폴백 없음).
describe("isOverseasIndexHoliday", () => {
  it("US 캘린더 없음 + NYSE 휴장일 (2026-09-07 Labor Day) → true (정적 폴백)", () => {
    expect(isOverseasIndexHoliday("SPX", "2026-09-07")).toBe(true);
  });

  it("US 캘린더 없음 + 평일 → false", () => {
    expect(isOverseasIndexHoliday("SPX", "2026-09-08")).toBe(false);
  });

  it("US 캘린더 open + NYSE 정적 휴장일 → false (캘린더가 정적 표를 이긴다)", () => {
    const cal: MarketCalendar = { US: { "2026-09-07": true } };
    expect(isOverseasIndexHoliday("SPX", "2026-09-07", cal)).toBe(false);
  });

  it("US 캘린더 closed + 평일 → true", () => {
    const cal: MarketCalendar = { US: { "2026-09-08": false } };
    expect(isOverseasIndexHoliday("NDX", "2026-09-08", cal)).toBe(true);
  });

  it("DE 2026-12-24 → true (XETRA 정적 표, 캘린더 무관)", () => {
    expect(isOverseasIndexHoliday("DAX", "2026-12-24")).toBe(true);
  });

  it("DE 12/25 → true / 12/31 → true / 12/28 (Mon) → false", () => {
    expect(isOverseasIndexHoliday("DAX", "2026-12-25")).toBe(true);
    expect(isOverseasIndexHoliday("DAX", "2026-12-31")).toBe(true);
    expect(isOverseasIndexHoliday("DAX", "2026-12-28")).toBe(false);
  });

  it("JP 캘린더 없음 → false (정적 폴백 없음)", () => {
    expect(isOverseasIndexHoliday("NI225", "2026-09-23")).toBe(false);
  });

  it("JP 캘린더 closed → true", () => {
    const cal: MarketCalendar = { JP: { "2026-09-23": false } };
    expect(isOverseasIndexHoliday("NI225", "2026-09-23", cal)).toBe(true);
  });

  it("HK 캘린더 closed → true / open → false / 부재 → false", () => {
    const cal: MarketCalendar = { HK: { "2026-10-01": false, "2026-10-02": true } };
    expect(isOverseasIndexHoliday("HSI", "2026-10-01", cal)).toBe(true);
    expect(isOverseasIndexHoliday("HSI", "2026-10-02", cal)).toBe(false);
    expect(isOverseasIndexHoliday("HSI", "2026-10-05", cal)).toBe(false);
  });

  it("CN 캘린더 closed → true / 캘린더 부재 → false (정적 폴백 없음)", () => {
    const cal: MarketCalendar = { CN: { "2026-10-01": false } };
    expect(isOverseasIndexHoliday("SHCOMP", "2026-10-01", cal)).toBe(true);
    expect(isOverseasIndexHoliday("SHCOMP", "2026-10-02")).toBe(false);
  });

  it("다른 시장 행만 있음 → 조회 시장은 정적 폴백 경로", () => {
    // US 는 NYSE 정적 표, JP 는 폴백 없음.
    const cal: MarketCalendar = { KRX: { "2026-09-07": false } };
    expect(isOverseasIndexHoliday("SPX", "2026-09-07", cal)).toBe(true);
    expect(isOverseasIndexHoliday("NI225", "2026-09-07", cal)).toBe(false);
  });
});

// F76 — 해외 4함수의 캘린더 관통 검증. 픽스처는 실전 휴장일:
//   US 2026-09-07 (Labor Day) closed / JP 2026-09-21 (경로의날)·09-23 (추분) closed(09-22 open) /
//   CN 2026-10-01~10-08 (국경절 연휴) closed, 10-09 open (실측 미확인 — 캘린더 관통만 검증).
describe("해외 4함수 캘린더 관통 (F76)", () => {
  const cal: MarketCalendar = {
    US: { "2026-09-07": false },
    JP: { "2026-09-21": false, "2026-09-22": true, "2026-09-23": false },
    CN: {
      "2026-10-01": false, "2026-10-02": false, "2026-10-03": false,
      "2026-10-04": false, "2026-10-05": false, "2026-10-06": false,
      "2026-10-07": false, "2026-10-08": false, "2026-10-09": true,
    },
  };

  it("getOverseasIndexSessionState('SPX', 2026-09-07 ET 장중, cal) → closed", () => {
    // 09-07 EDT 15:00 UTC = 11:00 ET (Labor Day, 캘린더 closed).
    expect(
      getOverseasIndexSessionState("SPX", utc(2026, 9, 7, 15, 0), cal),
    ).toBe("closed");
  });

  it("minutesSinceOverseasIndexClose('SPX', 09-07 마감 후, cal) → null (주말과 동일)", () => {
    // 09-07 EDT 20:05 UTC = 16:05 ET (마감 5분 후). 캘린더 전달 시 null.
    expect(
      minutesSinceOverseasIndexClose("SPX", utc(2026, 9, 7, 20, 5), cal),
    ).toBeNull();
    // 캘린더 미전달 시에도 US 는 정적 NYSE 표 폴백으로 09-07 Labor Day 인식 → null.
    expect(
      minutesSinceOverseasIndexClose("SPX", utc(2026, 9, 7, 20, 5)),
    ).toBeNull();
  });

  it("getOverseasIndexTradingDate('SHCOMP', 10-05 장중, cal) → 2026-09-30 (연휴 전 마지막 거래일)", () => {
    // 10-05 월 04:00 UTC = 12:00 SHCOMP. 캘린더로 10-01~10-04 전부 closed → findRecent
    // 는 09-30 (Wed 평일 무휴장) 반환.
    expect(
      getOverseasIndexTradingDate("SHCOMP", utc(2026, 10, 5, 4, 0), cal),
    ).toBe("2026-09-30");
  });

  it("getPreviousOverseasIndexTradingDate('NI225', '2026-09-24', cal) → 2026-09-22", () => {
    // 09-24 → shift -1 = 09-23 (JP 캘린더 closed) → shift -1 = 09-22 (JP 캘린더 open).
    expect(
      getPreviousOverseasIndexTradingDate("NI225", "2026-09-24", cal),
    ).toBe("2026-09-22");
  });

  it("캘린더 미전달 시 기존 동작 유지 — SPX 는 정적 NYSE 표로 09-07 여전히 closed", () => {
    // 정적 usMarketHolidays.ts 에 09-07 Labor Day 포함 → 폴백 경로도 동일 결과.
    expect(getOverseasIndexSessionState("SPX", utc(2026, 9, 7, 15, 0))).toBe(
      "closed",
    );
  });

  it("캘린더 미전달 시 JP 는 폴백 없음 — 09-23 평일이면 regular 시각대엔 regular", () => {
    // 09-23 수 06:30 UTC = 15:30 JST 마감 경계 미포함 → closed. 06:00 UTC = 15:00 JST 는
    // regular. 이 케이스는 폴백 부재 확인용.
    expect(
      getOverseasIndexSessionState("NI225", utc(2026, 9, 23, 6, 0)),
    ).toBe("regular");
    // 캘린더 전달 시 휴장으로 뒤바뀐다.
    expect(
      getOverseasIndexSessionState("NI225", utc(2026, 9, 23, 6, 0), cal),
    ).toBe("closed");
  });

  it("getPreviousOverseasIndexTradingDate('DAX', ...) — DE 는 XETRA 정적 표로 계속 처리", () => {
    // 12-28 → shift -1 = 12-27 (Sun) → -1 = 12-26 (Sat) → -1 = 12-25 (XETRA closed) →
    // -1 = 12-24 (XETRA closed) → -1 = 12-23 (Wed 평일 무휴장) 반환.
    expect(
      getPreviousOverseasIndexTradingDate("DAX", "2026-12-28"),
    ).toBe("2026-12-23");
  });
});

describe("isKrxBeforeMarketOpen", () => {
  it("pre → true (NXT 프리마켓 실봉 유입 차단 대상)", () => {
    expect(isKrxBeforeMarketOpen("pre")).toBe(true);
  });
  it("preopen → true (스냅샷 자연 차단이지만 의도 문서화)", () => {
    expect(isKrxBeforeMarketOpen("preopen")).toBe(true);
  });
  it("regular → false (정상 today-bar merge)", () => {
    expect(isKrxBeforeMarketOpen("regular")).toBe(false);
  });
  it("after → false (F41 별도 항목, 여기서 게이트 안 함)", () => {
    expect(isKrxBeforeMarketOpen("after")).toBe(false);
  });
  it("after_close → false", () => {
    expect(isKrxBeforeMarketOpen("after_close")).toBe(false);
  });
  it("closed → false (주말·공휴일 스냅샷 EOD 유지)", () => {
    expect(isKrxBeforeMarketOpen("closed")).toBe(false);
  });
  it("undefined → false (초기 로드 스켈레톤 · 게이트 오작동 방지)", () => {
    expect(isKrxBeforeMarketOpen(undefined)).toBe(false);
  });
});
