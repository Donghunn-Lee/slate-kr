import { describe, it, expect } from "vitest";
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
