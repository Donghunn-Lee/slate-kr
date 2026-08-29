import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getIndexIntraday1mPrices } from "@/lib/indices";
import {
  getKrxSessionState,
  getKrxTradingDate,
  isKrxMarketOpen,
  type KrxSession,
} from "@/shared/utils/market";
import { krxIndexRankingRevalidate } from "@/lib/sessionCache";
import { DOMESTIC_INDEX_CODES, type DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 지수 코드 × session × krxDate 별 unstable_cache 래퍼 memoize.
// session·tradingDate 를 key 축에 두어 세션·일 경계에서 자동 miss 를 보장한다.
type IndexFetcher = () => Promise<IndexIntradaySnapshot[] | null>;
const fetchers = new Map<string, IndexFetcher>();

const cacheKeyOf = (
  code: DomesticIndexCode,
  session: KrxSession,
  tradingDate: string,
): string => `${code}::${session}::${tradingDate}`;

const cacheTagOf = (code: DomesticIndexCode, session: KrxSession): string =>
  `index-intraday-1m-${code.toLowerCase()}-${session}`;

const getCachedFetcher = (
  code: DomesticIndexCode,
  session: KrxSession,
  tradingDate: string,
): IndexFetcher => {
  const key = cacheKeyOf(code, session, tradingDate);
  const cached = fetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => getIndexIntraday1mPrices(code),
    ["index-intraday-1m", code, session, tradingDate],
    {
      revalidate: krxIndexRankingRevalidate(session),
      tags: [cacheTagOf(code, session)],
    },
  );
  fetchers.set(key, fresh);
  return fresh;
};

type IndexResolveResult = {
  bars: IndexIntradaySnapshot[];
  failed: boolean;
};

const resolve = (
  code: DomesticIndexCode,
  session: KrxSession,
  r: PromiseSettledResult<IndexIntradaySnapshot[] | null>,
): IndexResolveResult => {
  if (r.status !== "fulfilled" || r.value === null) {
    revalidateTag(cacheTagOf(code, session), { expire: 0 });
    return { bars: [], failed: true };
  }
  return { bars: r.value, failed: false };
};

const emptyQuotes = (): Record<DomesticIndexCode, IndexIntradaySnapshot[]> =>
  Object.fromEntries(
    DOMESTIC_INDEX_CODES.map((c) => [c, [] as IndexIntradaySnapshot[]]),
  ) as Record<DomesticIndexCode, IndexIntradaySnapshot[]>;

const allFailed = (): Record<DomesticIndexCode, boolean> =>
  Object.fromEntries(DOMESTIC_INDEX_CODES.map((c) => [c, true])) as Record<
    DomesticIndexCode,
    boolean
  >;

export const GET = async () => {
  const session = getKrxSessionState();
  const tradingDate = getKrxTradingDate();
  const marketOpen = isKrxMarketOpen();

  try {
    const results = await Promise.allSettled(
      DOMESTIC_INDEX_CODES.map((code) =>
        getCachedFetcher(code, session, tradingDate)(),
      ),
    );
    const resolved = DOMESTIC_INDEX_CODES.map(
      (code, i) => [code, resolve(code, session, results[i])] as const,
    );

    const quotes = Object.fromEntries(
      resolved.map(([code, r]) => [code, r.bars]),
    ) as Record<DomesticIndexCode, IndexIntradaySnapshot[]>;
    const failed = Object.fromEntries(
      resolved.map(([code, r]) => [code, r.failed]),
    ) as Record<DomesticIndexCode, boolean>;

    return NextResponse.json({ quotes, marketOpen, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[index-intraday-1m] ${message}`);
    return NextResponse.json(
      {
        quotes: emptyQuotes(),
        marketOpen: false,
        failed: allFailed(),
      },
      { status: 200 },
    );
  }
};
