import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getIndexIntradayPrices } from "@/lib/indices";
import { isKrxMarketOpen } from "@/shared/utils/market";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";
const INDEX_CODES: readonly IndexCode[] = ["KOSPI", "KOSDAQ", "KOSPI200"];

type IndexQuotes = {
  kospi: IndexIntradaySnapshot[];
  kosdaq: IndexIntradaySnapshot[];
  kospi200: IndexIntradaySnapshot[];
};

type IndexFailedMap = {
  kospi: boolean;
  kosdaq: boolean;
  kospi200: boolean;
};

// 지수 × session 별로 unstable_cache 래퍼를 memoize. 장중 60s / 폐장 3600s.
// stock 쪽과 동일 패턴 — tag 도 session-scoped 로 정밀 evict.
type IndexFetcher = () => Promise<IndexIntradaySnapshot[] | null>;
const openFetchers = new Map<IndexCode, IndexFetcher>();
const closedFetchers = new Map<IndexCode, IndexFetcher>();

const cacheTag = (indexCode: IndexCode, marketOpen: boolean): string =>
  `index-intraday-${indexCode.toLowerCase()}-${marketOpen ? "open" : "closed"}`;

const getCachedFetcher = (
  indexCode: IndexCode,
  marketOpen: boolean,
): IndexFetcher => {
  const map = marketOpen ? openFetchers : closedFetchers;
  const cached = map.get(indexCode);
  if (cached) return cached;
  const tag = cacheTag(indexCode, marketOpen);
  const fresh = unstable_cache(
    () => getIndexIntradayPrices(indexCode),
    ["index-intraday", indexCode, marketOpen ? "open" : "closed"],
    { revalidate: marketOpen ? 60 : 3600, tags: [tag] },
  );
  map.set(indexCode, fresh);
  return fresh;
};

// PromiseSettledResult + null 실패 신호를 합쳐서 정규화. null 이면 evict + failed=true.
// bars 는 항상 배열로 collapse (클라 계약 유지: quotes.<code>: IndexIntradaySnapshot[]).
// failed 는 stock-intraday route 와 대칭으로 실패↔정상 empty 구분 신호를 클라이언트로 넘긴다.
type IndexResolveResult = {
  bars: IndexIntradaySnapshot[];
  failed: boolean;
};

const resolve = (
  indexCode: IndexCode,
  marketOpen: boolean,
  r: PromiseSettledResult<IndexIntradaySnapshot[] | null>,
): IndexResolveResult => {
  if (r.status !== "fulfilled" || r.value === null) {
    revalidateTag(cacheTag(indexCode, marketOpen), { expire: 0 });
    return { bars: [], failed: true };
  }
  return { bars: r.value, failed: true };
};

export const GET = async () => {
  const marketOpen = isKrxMarketOpen();
  try {
    const results = await Promise.allSettled(
      INDEX_CODES.map((code) => getCachedFetcher(code, marketOpen)()),
    );
    const [kospi, kosdaq, kospi200] = results;

    const kospiR = resolve("KOSPI", marketOpen, kospi);
    const kosdaqR = resolve("KOSDAQ", marketOpen, kosdaq);
    const kospi200R = resolve("KOSPI200", marketOpen, kospi200);

    const quotes: IndexQuotes = {
      kospi: kospiR.bars,
      kosdaq: kosdaqR.bars,
      kospi200: kospi200R.bars,
    };
    const failed: IndexFailedMap = {
      kospi: kospiR.failed,
      kosdaq: kosdaqR.failed,
      kospi200: kospi200R.failed,
    };

    return NextResponse.json({ quotes, marketOpen, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[index-intraday] ${message}`);
    return NextResponse.json(
      {
        quotes: { kospi: [], kosdaq: [], kospi200: [] },
        marketOpen: false,
        failed: { kospi: true, kosdaq: true, kospi200: true },
      },
      { status: 200 },
    );
  }
};
