import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getOverseasIndexIntradayPrices } from "@/lib/indices";
import { isUsMarketOpen } from "@/shared/utils/market";
import {
  OVERSEAS_INTRADAY_CODES,
  type OverseasIntradayCode,
} from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

type OverseasQuotes = {
  spx: IndexIntradaySnapshot[];
  comp: IndexIntradaySnapshot[];
  ndx: IndexIntradaySnapshot[];
};

type OverseasFailedMap = {
  spx: boolean;
  comp: boolean;
  ndx: boolean;
};

// 코드 × session 별 캐시. 정규장 120s / 폐장 3600s.
// 국내 60s 보다 완만한 이유: 라이브 자체가 ~15분 지연 피드라 짧은 revalidate 이득 없음.
type OverseasFetcher = () => Promise<IndexIntradaySnapshot[] | null>;
const openFetchers = new Map<OverseasIntradayCode, OverseasFetcher>();
const closedFetchers = new Map<OverseasIntradayCode, OverseasFetcher>();

const cacheTag = (code: OverseasIntradayCode, marketOpen: boolean): string =>
  `overseas-index-intraday-${code.toLowerCase()}-${marketOpen ? "open" : "closed"}`;

const getCachedFetcher = (
  code: OverseasIntradayCode,
  marketOpen: boolean,
): OverseasFetcher => {
  const map = marketOpen ? openFetchers : closedFetchers;
  const cached = map.get(code);
  if (cached) return cached;
  const tag = cacheTag(code, marketOpen);
  const fresh = unstable_cache(
    () => getOverseasIndexIntradayPrices(code),
    ["overseas-index-intraday", code, marketOpen ? "open" : "closed"],
    { revalidate: marketOpen ? 120 : 3600, tags: [tag] },
  );
  map.set(code, fresh);
  return fresh;
};

type OverseasResolveResult = {
  bars: IndexIntradaySnapshot[];
  failed: boolean;
};

const resolve = (
  code: OverseasIntradayCode,
  marketOpen: boolean,
  r: PromiseSettledResult<IndexIntradaySnapshot[] | null>,
): OverseasResolveResult => {
  if (r.status !== "fulfilled" || r.value === null) {
    revalidateTag(cacheTag(code, marketOpen), { expire: 0 });
    return { bars: [], failed: true };
  }
  return { bars: r.value, failed: false };
};

export const GET = async () => {
  const marketOpen = isUsMarketOpen();
  try {
    const results = await Promise.allSettled(
      OVERSEAS_INTRADAY_CODES.map((code) => getCachedFetcher(code, marketOpen)()),
    );
    const [spx, comp, ndx] = results;

    const spxR = resolve("SPX", marketOpen, spx);
    const compR = resolve("COMP", marketOpen, comp);
    const ndxR = resolve("NDX", marketOpen, ndx);

    const quotes: OverseasQuotes = {
      spx: spxR.bars,
      comp: compR.bars,
      ndx: ndxR.bars,
    };
    const failed: OverseasFailedMap = {
      spx: spxR.failed,
      comp: compR.failed,
      ndx: ndxR.failed,
    };

    return NextResponse.json({ quotes, marketOpen, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[overseas-index-intraday] ${message}`);
    return NextResponse.json(
      {
        quotes: { spx: [], comp: [], ndx: [] },
        marketOpen: false,
        failed: { spx: true, comp: true, ndx: true },
      },
      { status: 200 },
    );
  }
};
