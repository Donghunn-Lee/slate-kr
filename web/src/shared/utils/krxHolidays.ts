// 2026 KRX 휴장일 (평일만 — 주말 겹침 공휴일은 주말 판정이 처리).
// 캘린더 행이 없을 때(창 밖·조회 실패) 폴백으로 사용되며, market_trading_days 에
// 해당 일자 행이 있으면 그 is_open 값이 이 표를 이긴다.
// 갱신 주기: 연 1회 (우주항공청 월력요항 발표 후). 임시공휴일(예: 보궐선거) 발생 시 추가.
export const KRX_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-01-01", // 신정
  "2026-02-16", // 설날 연휴
  "2026-02-17", // 설날
  "2026-02-18", // 설날 연휴
  "2026-03-02", // 삼일절 대체공휴일
  "2026-05-01", // 근로자의 날
  "2026-05-05", // 어린이날
  "2026-05-25", // 부처님오신날 대체공휴일
  "2026-06-03", // 제8회 전국동시지방선거
  "2026-07-17", // 제헌절 대체공휴일
  "2026-08-17", // 광복절 대체공휴일
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-10-05", // 개천절 대체공휴일
  "2026-10-09", // 한글날
  "2026-12-25", // 성탄절
  "2026-12-31", // 연말 휴장
]);

import type { MarketCalendar } from "@/shared/types/marketCalendar";

// 캘린더 행 있음 → is_open 값이 정본. 행 없음 → 정적 표 폴백.
export const isKrxHoliday = (
  dateStr: string,
  calendar?: MarketCalendar,
): boolean => {
  const isOpen = calendar?.KRX?.[dateStr];
  if (isOpen !== undefined) return !isOpen;
  return KRX_HOLIDAYS_2026.has(dateStr);
};
