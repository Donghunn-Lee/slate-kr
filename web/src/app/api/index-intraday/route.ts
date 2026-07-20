import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getIndexIntradayPrices } from "@/lib/indices";
import { isKrxMarketOpen } from "@/shared/utils/market";
import { DOMESTIC_INDEX_CODES, type DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

type IndexQuotes = {
  kospi: IndexIntradaySnapshot[];
  kosdaq: IndexIntradaySnapshot[];
  kospi200: IndexIntradaySnapshot[];
  kosdaq150: IndexIntradaySnapshot[];
};

type IndexFailedMap = {
  kospi: boolean;
  kosdaq: boolean;
  kospi200: boolean;
  kosdaq150: boolean;
};

// 지수 × session 별로 unstable_cache 래퍼를 memoize. 장중 60s / 폐장 3600s.
// stock 쪽과 동일 패턴 — tag 도 session-scoped 로 정밀 evict.
type IndexFetcher = () => Promise<IndexIntradaySnapshot[] | null>;
const openFetchers = new Map<DomesticIndexCode, IndexFetcher>();
const closedFetchers = new Map<DomesticIndexCode, IndexFetcher>();

const cacheTag = (indexCode: DomesticIndexCode, marketOpen: boolean): string =>
  `index-intraday-${indexCode.toLowerCase()}-${marketOpen ? "open" : "closed"}`;

const getCachedFetcher = (
  indexCode: DomesticIndexCode,
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
  indexCode: DomesticIndexCode,
  marketOpen: boolean,
  r: PromiseSettledResult<IndexIntradaySnapshot[] | null>,
): IndexResolveResult => {
  if (r.status !== "fulfilled" || r.value === null) {
    revalidateTag(cacheTag(indexCode, marketOpen), { expire: 0 });
    return { bars: [], failed: true };
  }
  return { bars: r.value, failed: false };
};

export const GET = async () => {
  const marketOpen = isKrxMarketOpen();
  try {
    const results = await Promise.allSettled(
      DOMESTIC_INDEX_CODES.map((code) => getCachedFetcher(code, marketOpen)()),
    );
    const [kospi, kosdaq, kospi200, kosdaq150] = results;

    const kospiR = resolve("KOSPI", marketOpen, kospi);
    const kosdaqR = resolve("KOSDAQ", marketOpen, kosdaq);
    const kospi200R = resolve("KOSPI200", marketOpen, kospi200);
    const kosdaq150R = resolve("KOSDAQ150", marketOpen, kosdaq150);

    const quotes: IndexQuotes = {
      kospi: kospiR.bars,
      kosdaq: kosdaqR.bars,
      kospi200: kospi200R.bars,
      kosdaq150: kosdaq150R.bars,
    };
    const failed: IndexFailedMap = {
      kospi: kospiR.failed,
      kosdaq: kosdaqR.failed,
      kospi200: kospi200R.failed,
      kosdaq150: kosdaq150R.failed,
    };

    return NextResponse.json({ quotes, marketOpen, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[index-intraday] ${message}`);
    return NextResponse.json(
      {
        quotes: { kospi: [], kosdaq: [], kospi200: [], kosdaq150: [] },
        marketOpen: false,
        failed: { kospi: true, kosdaq: true, kospi200: true, kosdaq150: true },
      },
      { status: 200 },
    );
  }
};
