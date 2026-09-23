import { pool } from "./db";
import type {
  MarketCalendar,
  TradingMarket,
} from "@/shared/types/marketCalendar";

// market_trading_days 원시 row. trade_date 는 SELECT 에서 to_char 로 강제
// "YYYY-MM-DD" 문자열 수신 — Neon HTTP 가 DATE 를 로컬 midnight Date 로 파싱해
// 이후 UTC 기반 문자열화 시 TZ 오프셋만큼 shift 되는 경로를 원천 차단.
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

// SELECT to_char 로 이미 "YYYY-MM-DD" 문자열이 도달한다는 계약을 정규식으로 확인.
// 예상 밖 형식(스키마 변경·수동 SELECT 등)은 조용히 skip.
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

// KST 오늘 ±45일 조회 창. collector KRX 는 오늘~+23일, 해외는 어제·오늘만
// 적재하지만 세션 캐시 갱신 지연·오프셋을 흡수하는 여유 창을 둔다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pad = (n: number): string => String(n).padStart(2, "0");

const kstDateStr = (now: Date): string => {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
};

const shiftDays = (yyyyMmDd: string, delta: number): string => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

const CALENDAR_WINDOW_DAYS = 45;

const calendarRange = (now: Date): { from: string; to: string } => {
  const today = kstDateStr(now);
  return {
    from: shiftDays(today, -CALENDAR_WINDOW_DAYS),
    to: shiftDays(today, CALENDAR_WINDOW_DAYS),
  };
};

// 모듈 스코프 memo (값 + 만료시각). KIS 토큰 in-memory 층과 같은 형태.
// route unstable_cache fetcher 내부에서 호출되므로 Data Cache 중첩 회피 목적으로
// unstable_cache 는 쓰지 않는다.
const TTL_MS = 3600 * 1000;

type MemoEntry = { value: MarketCalendar; expiresAt: number };
let memo: MemoEntry | null = null;

export const getMarketCalendar = async (): Promise<MarketCalendar> => {
  const nowMs = Date.now();
  if (memo && memo.expiresAt > nowMs) return memo.value;

  const { from, to } = calendarRange(new Date(nowMs));
  try {
    const [rows] = await pool.query<MarketTradingDayRow[]>(
      "SELECT market, to_char(trade_date, 'YYYY-MM-DD') AS trade_date, is_open FROM market_trading_days WHERE trade_date BETWEEN $1 AND $2",
      [from, to],
    );
    const value = rowsToCalendar(rows);
    memo = { value, expiresAt: nowMs + TTL_MS };
    return value;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[marketCalendar] load failed: ${message}`);
    // memo 미저장 — 다음 요청에서 재시도. 이번 요청은 정적 폴백 경로로 흐른다.
    return {};
  }
};
