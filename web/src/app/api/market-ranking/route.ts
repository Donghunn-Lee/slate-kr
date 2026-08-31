import { revalidateTag, unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { fetchRanking } from "@/lib/kis-ranking-fetch";
import { pool } from "@/lib/db";
import {
  getKrxSessionState,
  getKrxTradingDate,
  isKrxMarketOpen,
  type KrxSession,
} from "@/shared/utils/market";
import { krxIndexRankingRevalidate } from "@/lib/sessionCache";
import type {
  Market,
  MarketRankingItem,
  MarketRankingKind,
} from "@/shared/types/ranking";
import type { StockSummary } from "@/shared/types/stock";

export const dynamic = "force-dynamic";

// kind × market 조합 = 4 × 3 = 12 유한 key. 모두 flat 문자열로 상수화 → 캐시 hit 율 유지.
// URL 파라미터는 by=shares|value (kind="volume" 과의 명명 중복 해소), lib 은 by=volume|value 유지.
const flatKey = (k: MarketRankingKind): string => {
  const suffix = `-${k.market}`;
  return k.kind === "fluctuation"
    ? `fluc-${k.direction}${suffix}`
    : `vol-${k.by === "volume" ? "shares" : "value"}${suffix}`;
};

const parseMarket = (raw: string | null): Market => {
  if (raw === "kospi" || raw === "kosdaq") return raw;
  return "all"; // default (raw === null || "all" 포함)
};

const parseKind = (params: URLSearchParams): MarketRankingKind | null => {
  const kind = params.get("kind");
  const market = parseMarket(params.get("market"));
  if (kind === "fluctuation") {
    const dir = params.get("direction");
    if (dir === "up" || dir === "down") {
      return { kind, direction: dir, market };
    }
    return null;
  }
  if (kind === "volume") {
    const by = params.get("by");
    if (by === "shares") return { kind, by: "volume", market };
    if (by === "value") return { kind, by: "value", market };
    return null;
  }
  return null;
};

// DB 조회로 종목별 시장 구분을 매핑. KIS 순위 응답에는 per-row market 이 없다.
// 실패는 items 그대로 반환 — 순위 응답 실패 계약(failed flag)에는 영향 없음.
// unstable_cache 내부에서 호출되므로 캐시 hit 시 DB 재조회하지 않는다.
type StockMarketRow = { ticker: string; market: StockSummary["market"] };

const enrichWithMarket = async (
  items: MarketRankingItem[],
): Promise<MarketRankingItem[]> => {
  if (items.length === 0) return items;
  try {
    const tickers = items.map((i) => i.ticker);
    const placeholders = tickers.map((_, i) => `$${i + 1}`).join(",");
    const [rows] = await pool.query<StockMarketRow[]>(
      `SELECT ticker, market FROM stocks WHERE ticker IN (${placeholders}) AND is_active = true`,
      tickers,
    );
    const marketByTicker = new Map(rows.map((r) => [r.ticker, r.market]));
    return items.map((i) => {
      const market = marketByTicker.get(i.ticker);
      return market ? { ...i, market } : i;
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[market-ranking] market enrich failed: ${message}`);
    return items;
  }
};

// fetchRanking 은 discriminated union 반환 — 캐시에는 items | null 로 축소해 저장.
// 실패 kind 세부(token/http/business/…) 는 lib 에서 이미 console.error, route/클라이언트는 failed 만 소비.
const runFetch = async (
  kind: MarketRankingKind,
): Promise<MarketRankingItem[] | null> => {
  const r = await fetchRanking(kind);
  if (!r.ok) return null;
  return enrichWithMarket(r.items);
};

const cacheTag = (key: string, session: KrxSession): string =>
  `market-ranking-${key}-${session}`;

// key × session × krxDate 별 unstable_cache 래퍼 memoize. 활성 세션(regular) 60s / 그 외 3600s.
// F41(stock-intraday) 패턴 확장: session + tradingDate 를 key 축으로 넣어 세션·일 경계에서 자동 miss.
// 이전 open/closed 이분 tag 는 tradingDate 부재로 서버 인스턴스가 다음날까지 살 경우
// 어제 랭크가 preopen 에 재사용될 여지가 있었다.
type RankingFetcher = () => Promise<MarketRankingItem[] | null>;
const fetchers = new Map<string, RankingFetcher>();

const cacheKeyOf = (
  key: string,
  session: KrxSession,
  tradingDate: string,
): string => `${key}::${session}::${tradingDate}`;

const getCachedFetcher = (
  kind: MarketRankingKind,
  session: KrxSession,
  tradingDate: string,
): { fetcher: RankingFetcher; key: string } => {
  const key = flatKey(kind);
  const mapKey = cacheKeyOf(key, session, tradingDate);
  const cached = fetchers.get(mapKey);
  if (cached) return { fetcher: cached, key };
  const tag = cacheTag(key, session);
  const fresh = unstable_cache(
    () => runFetch(kind),
    ["market-ranking", key, session, tradingDate],
    { revalidate: krxIndexRankingRevalidate(session, null), tags: [tag] },
  );
  fetchers.set(mapKey, fresh);
  return { fetcher: fresh, key };
};

type RankingResponse = {
  items: MarketRankingItem[];
  failed: boolean;
  session: KrxSession;
  marketOpen: boolean;
};

export const GET = async (req: NextRequest) => {
  const kind = parseKind(req.nextUrl.searchParams);
  if (!kind) {
    return NextResponse.json(
      {
        error:
          "invalid ranking params (kind=fluctuation&direction=up|down or kind=volume&by=shares|value, optional market=all|kospi|kosdaq)",
      },
      { status: 400 },
    );
  }

  // 세션/marketOpen 은 순수 KST 시계 — try 밖에서 계산해 catch 경로에도 그대로 얹는다 (#077).
  const session = getKrxSessionState();
  const marketOpen = isKrxMarketOpen();
  const tradingDate = getKrxTradingDate();

  try {
    const { fetcher, key } = getCachedFetcher(kind, session, tradingDate);
    const items = await fetcher();
    if (items === null) {
      // 실패 캐시 오염 방지 (#075) — 세션별 tag 정밀 evict.
      revalidateTag(cacheTag(key, session), { expire: 0 });
      const body: RankingResponse = {
        items: [],
        failed: true,
        session,
        marketOpen,
      };
      return NextResponse.json(body);
    }
    const body: RankingResponse = {
      items,
      failed: false,
      session,
      marketOpen,
    };
    return NextResponse.json(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[market-ranking] ${message}`);
    const body: RankingResponse = {
      items: [],
      failed: true,
      session,
      marketOpen,
    };
    return NextResponse.json(body);
  }
};
