import type {
  Market,
  MarketRankingItem,
  MarketRankingKind,
} from "@/shared/types/ranking";
import type { StockQuote } from "@/shared/types/quote";
import {
  getKstDateAndMinutes,
  isKrxBeforeMarketOpen,
  type KrxSession,
} from "@/shared/utils/market";
import { createRng, hashSeed, logUniform } from "./demo-prng";
import {
  limitPrices,
  quoteAt,
  type DemoChannel,
  type DemoTier,
} from "./demo-price-model";
import { getDemoEodDate, getDemoUniverse, type DemoUniverseEntry } from "./demo-universe";

// 시장 순위 — universe 전 종목의 현재가를 한 표로 만들고 kind 별로 정렬한다.
// 실패는 universe 조회(DB) 실패뿐.

// 1회 응답 건수. slice / 카테고리 라벨링은 상위 계층에서.
const RANKING_LIMIT = 30;

// 시세 채널 축. 개장 전(pre · preopen) 은 NXT 프리마켓만 체결이 흐르므로 NX — 비NXT 종목은
// 집계에서 빠진다(캡션 "프리마켓 · NXT" 와 같은 축). 그 외 세션은 KRX+NXT 통합 UN.
export const rankingMarketDiv = (session: KrxSession): DemoChannel =>
  isKrxBeforeMarketOpen(session) ? "NX" : "UN";

export type RankingFetchResult =
  | { ok: true; items: MarketRankingItem[] }
  | { ok: false; error: RankingFetchError };

export type RankingFetchError = { kind: "network_error"; message: string };

const MARKET_FILTER: Record<Exclude<Market, "all">, DemoUniverseEntry["market"]> = {
  kospi: "KOSPI",
  kosdaq: "KOSDAQ",
};

type RankedQuote = {
  entry: DemoUniverseEntry;
  quote: StockQuote;
  changeSign: string;
  tradeValue: number;
  marketCap: number | null;
  interestCount: number;
};

// 1=상한, 2=상승, 3=보합, 4=하한, 5=하락. 상 · 하한가는 기준가(price − change) 의 ±30% 틱 경계.
const changeSignOf = (quote: StockQuote): string => {
  const { lower, upper } = limitPrices(quote.price - quote.change);
  if (quote.change > 0) return quote.price >= upper ? "1" : "2";
  if (quote.change < 0) return quote.price <= lower ? "4" : "5";
  return "3";
};

// 관심 등록 수 — 종목 시드 상수 × 시총 tier 가중, 날마다 ±10% 흔들림.
const INTEREST_BASE_MIN = 300;
const INTEREST_BASE_MAX = 50_000;
const INTEREST_TIER_WEIGHT: Record<DemoTier, number> = { large: 4, mid: 1.6, small: 1 };
const INTEREST_DAILY_JITTER = 0.1;

const interestCountOf = (entry: DemoUniverseEntry, eodDate: string): number => {
  const base =
    logUniform(createRng(hashSeed(entry.ticker, "interest")), INTEREST_BASE_MIN, INTEREST_BASE_MAX) *
    INTEREST_TIER_WEIGHT[entry.profile.tier];
  const jitter =
    1 - INTEREST_DAILY_JITTER + 2 * INTEREST_DAILY_JITTER * createRng(hashSeed(entry.ticker, "interest", eodDate))();
  return Math.round(base * jitter);
};

const buildTable = async (now: Date, channel: DemoChannel): Promise<RankedQuote[]> => {
  const entries = await getDemoUniverse();
  const eodDate = getDemoEodDate(now);
  const rows: RankedQuote[] = [];
  for (const entry of entries) {
    const quote = quoteAt(entry.ticker, entry.profile, now, channel);
    if (!quote) continue;
    rows.push({
      entry,
      quote,
      changeSign: changeSignOf(quote),
      tradeValue: quote.price * quote.volume,
      marketCap: entry.shares !== null ? quote.price * entry.shares : null,
      interestCount: interestCountOf(entry, eodDate),
    });
  }
  return rows;
};

// 전 종목 시세 표를 (EOD 날짜, 분, 채널) 키로 모듈 메모 — kind 4 × market 3 요청이 한 번의
// 계산을 공유한다. 실패한 표는 다음 요청이 다시 만든다.
let memo: { key: string; table: Promise<RankedQuote[]> } | null = null;

const getTable = (now: Date, channel: DemoChannel): Promise<RankedQuote[]> => {
  const { date, minutes } = getKstDateAndMinutes(now);
  const key = `${getDemoEodDate(now)}|${date}|${minutes}|${channel}`;
  if (memo?.key === key) return memo.table;
  const table = buildTable(now, channel).catch((err: unknown) => {
    if (memo?.key === key) memo = null;
    throw err;
  });
  memo = { key, table };
  return table;
};

const byTicker = (a: RankedQuote, b: RankedQuote): number =>
  a.entry.ticker < b.entry.ticker ? -1 : 1;

const sortKey = (kind: MarketRankingKind): ((row: RankedQuote) => number) => {
  if (kind.kind === "fluctuation") {
    return kind.direction === "up"
      ? (row) => row.quote.changeRate
      : (row) => -row.quote.changeRate;
  }
  if (kind.kind === "volume") {
    return kind.by === "volume" ? (row) => row.quote.volume : (row) => row.tradeValue;
  }
  if (kind.kind === "market-cap") return (row) => row.marketCap ?? 0;
  return (row) => row.interestCount;
};

const toItem = (row: RankedQuote, kind: MarketRankingKind, rank: number): MarketRankingItem => {
  const { entry, quote } = row;
  const base: MarketRankingItem = {
    ticker: entry.ticker,
    name: entry.name,
    price: quote.price,
    change: quote.change,
    changePct: quote.changeRate,
    changeSign: row.changeSign,
    rank,
    market: entry.market,
    volume: quote.volume,
  };
  if (kind.kind === "volume") return { ...base, tradeValue: row.tradeValue };
  if (kind.kind === "market-cap") {
    return row.marketCap === null ? base : { ...base, marketCap: row.marketCap };
  }
  if (kind.kind === "top-interest") {
    return { ...base, tradeValue: row.tradeValue, interestCount: row.interestCount };
  }
  return base;
};

// session 은 시세 채널 축(rankingMarketDiv)만 정한다 — 캐시·TTL 은 route 소관.
export const fetchRanking = async (
  kind: MarketRankingKind,
  session: KrxSession,
): Promise<RankingFetchResult> => {
  try {
    const table = await getTable(new Date(), rankingMarketDiv(session));
    const market = kind.market === "all" ? null : MARKET_FILTER[kind.market];
    const key = sortKey(kind);
    const items = table
      .filter((row) => market === null || row.entry.market === market)
      .filter((row) => kind.kind !== "market-cap" || row.marketCap !== null)
      .sort((a, b) => key(b) - key(a) || byTicker(a, b))
      .slice(0, RANKING_LIMIT)
      .map((row, i) => toItem(row, kind, i + 1));
    return { ok: true, items };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ranking-source] universe load failed: ${message}`);
    return { ok: false, error: { kind: "network_error", message } };
  }
};
