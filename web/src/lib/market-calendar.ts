import type { MarketCalendar } from "@/shared/types/marketCalendar";

// 거래일 판정은 정적 휴장일 표만 쓴다. 빈 캘린더는 모든 호출부를 정적 폴백으로 흘리고, 호출 측
// 시그니처(캘린더 인자)는 그대로 둔다.
export const getMarketCalendar = async (): Promise<MarketCalendar> => ({});
