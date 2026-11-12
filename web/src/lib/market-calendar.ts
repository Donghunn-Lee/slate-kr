import type {
  MarketCalendar,
  TradingMarket,
} from "@/shared/types/marketCalendar";

// market_trading_days 행 형태. trade_date 는 "YYYY-MM-DD" 문자열.
export type MarketTradingDayRow = {
  market: string;
  trade_date: string;
  is_open: boolean;
};

const TRADING_MARKETS: readonly TradingMarket[] = [
  "KRX",
  "US",
  "JP",
  "HK",
  "CN",
] as const;

const isTradingMarket = (v: string): v is TradingMarket =>
  (TRADING_MARKETS as readonly string[]).includes(v);

// "YYYY-MM-DD" 계약을 정규식으로 확인. 예상 밖 형식은 조용히 skip.
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const toDateKey = (v: string): string | null => (DATE_KEY_RE.test(v) ? v : null);

export const rowsToCalendar = (
  rows: readonly MarketTradingDayRow[],
): MarketCalendar => {
  const acc: { [K in TradingMarket]?: Record<string, boolean> } = {};
  for (const row of rows) {
    if (!isTradingMarket(row.market)) continue;
    const key = toDateKey(row.trade_date);
    if (key === null) continue;
    const bucket = acc[row.market] ?? {};
    bucket[key] = row.is_open;
    acc[row.market] = bucket;
  }
  return acc;
};

// 거래일 판정은 정적 휴장일 표만 쓴다. 빈 캘린더는 모든 호출부를 정적 폴백으로 흘리고, 호출 측
// 시그니처(캘린더 인자)는 그대로 둔다.
export const getMarketCalendar = async (): Promise<MarketCalendar> => ({});
