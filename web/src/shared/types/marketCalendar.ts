// 거래일 캘린더 도메인 모델. 시장 문자열은 KRX/US/JP/HK/CN 5개.
// DE(XETRA)는 캘린더 대상 아님 — 정적 캘린더로만 다룬다.
export type TradingMarket = "KRX" | "US" | "JP" | "HK" | "CN";

// 시장별 "YYYY-MM-DD" → is_open 매핑. 행 없음 = 미조회 → 정적 폴백 진입 신호.
// plain object로 유지해 이후 서버→클라 직렬화 시 재작업이 없도록 한다.
export type MarketCalendar = Readonly<
  Partial<Record<TradingMarket, Readonly<Record<string, boolean>>>>
>;
