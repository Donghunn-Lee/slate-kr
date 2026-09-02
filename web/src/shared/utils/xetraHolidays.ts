// 2026 XETRA(독일 프랑크푸르트) 전일 휴장일.
// KIS CTOS5011R 응답은 DE 를 커버하지 않아 market_trading_days 에 적재되지 않는다.
// collector/verify_daily_freshness.py 의 XETRA_HOLIDAYS_2026 과 동일 값 유지 —
// 갱신 주기: 연 1회. 그쪽이 정본, 이 파일은 미러.
export const XETRA_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-12-24", // Christmas Eve
  "2026-12-25", // Christmas Day
  "2026-12-31", // New Year's Eve
]);

export const isXetraHoliday = (dateStr: string): boolean =>
  XETRA_HOLIDAYS_2026.has(dateStr);
