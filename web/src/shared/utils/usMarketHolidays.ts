// 2026 NYSE 전일 휴장일. 조기마감일(1/2, 7/3(Thu 조기), 11/27, 12/24 등)은
// 보수적으로 정규장 마감(16:00 ET)으로 취급하기 위해 목록에서 제외한다.
// 관측 이동: 2026-07-04(Sat) → 7/3(Fri) 관측 · 다른 이동은 없음.
export const NYSE_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed, 7/4 Sat)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day
]);

export const isUsMarketHoliday = (dateStr: string): boolean =>
  NYSE_HOLIDAYS_2026.has(dateStr);
