// 2026 XETRA(독일 프랑크푸르트) 전일 휴장일.
// DE 는 거래일 캘린더 대상 시장이 아니라 이 표로만 판정한다. 갱신 주기: 연 1회.
export const XETRA_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-12-24", // Christmas Eve
  "2026-12-25", // Christmas Day
  "2026-12-31", // New Year's Eve
]);

export const isXetraHoliday = (dateStr: string): boolean => XETRA_HOLIDAYS_2026.has(dateStr);
