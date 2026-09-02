// market_trading_days 도메인 모델.
// collector fetch_market_calendar.py 가 적재하는 5개 시장 문자열(KRX/US/JP/HK/CN)과
// 정렬. DE(XETRA)는 이 테이블 저장 대상 아님 — 정적 캘린더로만 다룬다.
export type TradingMarket = "KRX" | "US" | "JP" | "HK" | "CN";

// 시장별 "YYYY-MM-DD" → is_open 매핑. 행 없음 = 미조회 → 정적 폴백 진입 신호.
// plain object로 유지해 이후 서버→클라 직렬화 시 재작업이 없도록 한다.
export type MarketCalendar = Readonly<
  Partial<Record<TradingMarket, Readonly<Record<string, boolean>>>>
>;
