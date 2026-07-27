import { pool } from "./db";
import type { KrxSession } from "@/shared/utils/market";
import type { PriceSign, StockQuote } from "@/shared/types/quote";

// quote_snapshots (수집기 fetch_quote_snapshots.py 산출) 조회 + StockQuote 변환.
// 오프아워 세션(after_close/closed/preopen) quote 서빙에서 KIS 콜을 대체한다.
//
// (A) nx_eligible=false(비NXT) → snapshotToQuote null 반환.
//     비NXT 는 UN 값(=KRX 종가)을 서빙해도 StockHeaderLivePrice.isNxtMiss 판정이
//     live 존재로 무너져 "애프터마켓 종가"@20:00 로 라벨 회귀. null 로 흘리면
//     isNxtMiss=true 유지되고 "장 마감"@15:30 라벨 + SSR EOD initialPrice 표시.
//     KIS 콜 제거라는 목적은 nx_eligible 컬럼으로 대체 판정되어 온전 달성.
// (B) StockQuote.open/high/low 는 스냅샷에 없어 0 로 채움. mergeLiveDayBar 의
//     isInvalidQuoteOhl 게이트(OHL 삼중 0)가 이미 존재하여 EOD 봉을 그대로 유지.

// DB row (pool.query bigint/numeric → Number 자동 캐스팅). date 는 Date 객체.
type QuoteSnapshotRow = {
  ticker: string;
  date: Date;
  un_close: number;
  un_change: number;
  un_change_rate: number;
  un_volume: number;
  un_value: number | null;
  nx_eligible: boolean;
  nx_close: number | null;
  nx_volume: number | null;
};

const signOf = (change: number): PriceSign =>
  change > 0 ? "up" : change < 0 ? "down" : "flat";

// 순수 변환. row 는 이미 nx_eligible=true 필터 없이 그대로 받고, 여기서 판정한다.
export const snapshotToQuote = (row: QuoteSnapshotRow): StockQuote | null => {
  if (!row.nx_eligible) return null;
  return {
    ticker: row.ticker,
    price: row.un_close,
    change: row.un_change,
    changeRate: row.un_change_rate,
    sign: signOf(row.un_change),
    open: 0,
    high: 0,
    low: 0,
    volume: row.un_volume,
  };
};

// 대상 세션 판정 — 라이브 세션(regular/after/pre)은 기존 KIS 경로 유지.
export const isSnapshotSession = (session: KrxSession | undefined): boolean =>
  session === "after_close" || session === "closed" || session === "preopen";

// ── 단건 fetch + 결정 ────────────────────────────────────────
export type SingleSnapshotDecision =
  | { kind: "serve"; quote: StockQuote | null } // hit 또는 부분 miss(= null)
  | { kind: "fallback" }; // 대상 세션 아님 or date 캡처 실패

// 순수 결정 함수 (테스트 용). row=undefined + dateExists=true 는 부분 miss.
export const decideSingleSnapshot = (
  session: KrxSession | undefined,
  row: QuoteSnapshotRow | undefined,
  dateExists: boolean,
): SingleSnapshotDecision => {
  if (!isSnapshotSession(session)) return { kind: "fallback" };
  if (!dateExists) return { kind: "fallback" };
  return { kind: "serve", quote: row ? snapshotToQuote(row) : null };
};

export const fetchQuoteSnapshot = async (
  ticker: string,
  date: string,
): Promise<{ row: QuoteSnapshotRow | undefined; dateExists: boolean }> => {
  const [rows] = await pool.query<QuoteSnapshotRow[]>(
    "SELECT * FROM quote_snapshots WHERE ticker = $1 AND date = $2 LIMIT 1",
    [ticker, date],
  );
  if (rows.length > 0) {
    return { row: rows[0], dateExists: true };
  }
  const [check] = await pool.query<{ present: number }[]>(
    "SELECT 1 AS present FROM quote_snapshots WHERE date = $1 LIMIT 1",
    [date],
  );
  return { row: undefined, dateExists: check.length > 0 };
};

// ── 복수 fetch + 결정 ────────────────────────────────────────
export type MultiSnapshotDecision =
  | { kind: "serve"; byTicker: Record<string, StockQuote | null> }
  | { kind: "fallback" };

export const decideMultiSnapshot = (
  session: KrxSession | undefined,
  tickers: string[],
  byTicker: Record<string, QuoteSnapshotRow>,
  dateExists: boolean,
): MultiSnapshotDecision => {
  if (!isSnapshotSession(session)) return { kind: "fallback" };
  if (!dateExists) return { kind: "fallback" };
  const out: Record<string, StockQuote | null> = {};
  for (const t of tickers) {
    const row = byTicker[t];
    out[t] = row ? snapshotToQuote(row) : null;
  }
  return { kind: "serve", byTicker: out };
};

export const fetchQuoteSnapshots = async (
  tickers: string[],
  date: string,
): Promise<{
  byTicker: Record<string, QuoteSnapshotRow>;
  dateExists: boolean;
}> => {
  if (tickers.length === 0) {
    // 빈 요청. dateExists 는 상관없음 → false 로 두고 route 가 자연스레 skip.
    return { byTicker: {}, dateExists: false };
  }
  const placeholders = tickers.map((_, i) => `$${i + 1}`).join(",");
  const [rows] = await pool.query<QuoteSnapshotRow[]>(
    `SELECT * FROM quote_snapshots
       WHERE ticker IN (${placeholders}) AND date = $${tickers.length + 1}`,
    [...tickers, date],
  );
  const byTicker: Record<string, QuoteSnapshotRow> = {};
  for (const row of rows) {
    byTicker[row.ticker] = row;
  }
  if (rows.length > 0) {
    return { byTicker, dateExists: true };
  }
  const [check] = await pool.query<{ present: number }[]>(
    "SELECT 1 AS present FROM quote_snapshots WHERE date = $1 LIMIT 1",
    [date],
  );
  return { byTicker, dateExists: check.length > 0 };
};
