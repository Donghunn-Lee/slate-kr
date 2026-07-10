import { revalidateTag, unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { fetchRanking } from "@/lib/kis-ranking-fetch";
import {
  getKrxSessionState,
  isKrxMarketOpen,
  type KrxSession,
} from "@/shared/utils/market";
import type {
  MarketRankingItem,
  MarketRankingKind,
} from "@/shared/types/ranking";

export const dynamic = "force-dynamic";

// 4종 유한 카테고리 — 조합 아닌 flat key. index-intraday(3지수) 와 동형 구조.
type RankingKey = "fluc-up" | "fluc-down" | "vol-shares" | "vol-value";

const KEY_TO_KIND: Record<RankingKey, MarketRankingKind> = {
  "fluc-up": { kind: "fluctuation", direction: "up" },
  "fluc-down": { kind: "fluctuation", direction: "down" },
  "vol-shares": { kind: "volume", by: "volume" },
  "vol-value": { kind: "volume", by: "value" },
};

// URL 파라미터는 by=shares|value 로 노출 — kind="volume" 과의 명명 중복을 URL 쪽에서 해소.
// lib 는 by: "volume" | "value" (endpoint 문서 용어) 유지, route 에서만 매핑.
const parseKey = (params: URLSearchParams): RankingKey | null => {
  const kind = params.get("kind");
  if (kind === "fluctuation") {
    const dir = params.get("direction");
    if (dir === "up") return "fluc-up";
    if (dir === "down") return "fluc-down";
    return null;
  }
  if (kind === "volume") {
    const by = params.get("by");
    if (by === "shares") return "vol-shares";
    if (by === "value") return "vol-value";
    return null;
  }
  return null;
};

// fetchRanking 은 discriminated union 반환 — 캐시에는 items | null 로 축소해 저장.
// 실패 kind 세부(token/http/business/…) 는 lib 에서 이미 console.error, route/클라이언트는 failed 만 소비.
const runFetch = async (
  kind: MarketRankingKind,
): Promise<MarketRankingItem[] | null> => {
  const r = await fetchRanking(kind);
  return r.ok ? r.items : null;
};

const cacheTag = (key: RankingKey, marketOpen: boolean): string =>
  `market-ranking-${key}-${marketOpen ? "open" : "closed"}`;

// key × session 별 unstable_cache 래퍼 memoize. 장중 60s / 폐장 3600s — index-intraday 통일.
type RankingFetcher = () => Promise<MarketRankingItem[] | null>;
const openFetchers = new Map<RankingKey, RankingFetcher>();
const closedFetchers = new Map<RankingKey, RankingFetcher>();

const getCachedFetcher = (
  key: RankingKey,
  marketOpen: boolean,
): RankingFetcher => {
  const map = marketOpen ? openFetchers : closedFetchers;
  const cached = map.get(key);
  if (cached) return cached;
  const tag = cacheTag(key, marketOpen);
  const fresh = unstable_cache(
    () => runFetch(KEY_TO_KIND[key]),
    ["market-ranking", key, marketOpen ? "open" : "closed"],
    { revalidate: marketOpen ? 60 : 3600, tags: [tag] },
  );
  map.set(key, fresh);
  return fresh;
};

type RankingResponse = {
  items: MarketRankingItem[];
  failed: boolean;
  session: KrxSession;
  marketOpen: boolean;
};

export const GET = async (req: NextRequest) => {
  const key = parseKey(req.nextUrl.searchParams);
  if (!key) {
    return NextResponse.json(
      {
        error:
          "invalid ranking params (kind=fluctuation&direction=up|down or kind=volume&by=shares|value)",
      },
      { status: 400 },
    );
  }

  // 세션/marketOpen 은 순수 KST 시계 — try 밖에서 계산해 catch 경로에도 그대로 얹는다 (#077).
  const session = getKrxSessionState();
  const marketOpen = isKrxMarketOpen();

  try {
    const items = await getCachedFetcher(key, marketOpen)();
    if (items === null) {
      // 실패 캐시 오염 방지 (#075) — 세션별 tag 정밀 evict.
      revalidateTag(cacheTag(key, marketOpen), { expire: 0 });
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
