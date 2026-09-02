import { describe, it, expect } from "vitest";
import { rowsToCalendar, type MarketTradingDayRow } from "./marketCalendar";

describe("rowsToCalendar", () => {
  it("빈 rows → {}", () => {
    expect(rowsToCalendar([])).toEqual({});
  });

  it("string 'YYYY-MM-DD' trade_date → 그대로 key", () => {
    const rows: MarketTradingDayRow[] = [
      { market: "KRX", trade_date: "2026-09-01", is_open: true },
      { market: "KRX", trade_date: "2026-09-24", is_open: false },
    ];
    const cal = rowsToCalendar(rows);
    expect(cal.KRX?.["2026-09-01"]).toBe(true);
    expect(cal.KRX?.["2026-09-24"]).toBe(false);
  });

  it("Date 인스턴스 trade_date (UTC 자정) → 원본 캘린더 일자 복원", () => {
    const rows: MarketTradingDayRow[] = [
      { market: "US", trade_date: new Date("2026-09-07T00:00:00Z"), is_open: false },
    ];
    const cal = rowsToCalendar(rows);
    expect(cal.US?.["2026-09-07"]).toBe(false);
  });

  it("여러 시장 grouping — KRX / US / JP / HK / CN 5종 모두", () => {
    const rows: MarketTradingDayRow[] = [
      { market: "KRX", trade_date: "2026-09-01", is_open: true },
      { market: "US", trade_date: "2026-09-07", is_open: false },
      { market: "JP", trade_date: "2026-09-23", is_open: false },
      { market: "HK", trade_date: "2026-10-01", is_open: false },
      { market: "CN", trade_date: "2026-10-01", is_open: false },
    ];
    const cal = rowsToCalendar(rows);
    expect(cal.KRX?.["2026-09-01"]).toBe(true);
    expect(cal.US?.["2026-09-07"]).toBe(false);
    expect(cal.JP?.["2026-09-23"]).toBe(false);
    expect(cal.HK?.["2026-10-01"]).toBe(false);
    expect(cal.CN?.["2026-10-01"]).toBe(false);
  });

  it("알 수 없는 market 문자열(VN/GB 등)은 skip", () => {
    const rows: MarketTradingDayRow[] = [
      { market: "VN", trade_date: "2026-09-01", is_open: true },
      { market: "GB", trade_date: "2026-09-01", is_open: true },
      { market: "KRX", trade_date: "2026-09-01", is_open: true },
    ];
    const cal = rowsToCalendar(rows);
    expect(cal.KRX?.["2026-09-01"]).toBe(true);
    // VN, GB 는 TradingMarket 유니온 밖 — 캘린더에 진입 자체가 없다.
    expect(Object.keys(cal)).toEqual(["KRX"]);
  });

  it("잘못된 trade_date (null / 짧은 문자열 / 숫자) → 해당 row skip", () => {
    const rows: MarketTradingDayRow[] = [
      { market: "KRX", trade_date: null, is_open: true },
      { market: "KRX", trade_date: "26-09", is_open: true },
      { market: "KRX", trade_date: 20260901, is_open: true },
      { market: "KRX", trade_date: "2026-09-01", is_open: false },
    ];
    const cal = rowsToCalendar(rows);
    expect(cal.KRX).toEqual({ "2026-09-01": false });
  });

  it("동일 (market, date) 중복은 뒤에 오는 값이 이긴다", () => {
    const rows: MarketTradingDayRow[] = [
      { market: "KRX", trade_date: "2026-09-01", is_open: true },
      { market: "KRX", trade_date: "2026-09-01", is_open: false },
    ];
    const cal = rowsToCalendar(rows);
    expect(cal.KRX?.["2026-09-01"]).toBe(false);
  });
});
