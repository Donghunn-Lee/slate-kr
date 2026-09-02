import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getIndexIntradayPrices } from "@/lib/indices";
import { getMarketCalendar } from "@/lib/marketCalendar";
import {
  getKrxSessionState,
  getKrxTradingDate,
  isKrxMarketOpen,
  minutesSinceKrxClose,
  type KrxSession,
} from "@/shared/utils/market";
import { krxIndexRankingRevalidate } from "@/lib/sessionCache";
import { DOMESTIC_INDEX_CODES, type DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 지수 코드 × session × krxDate 별 unstable_cache 래퍼 memoize.
// session·tradingDate 를 key 축에 두어 세션·일 경계에서 자동 miss 를 보장한다
// (미포함 시 preopen 진입 때 어제 봉이 stale 로 재사용될 수 있음).
// TTL: 활성 세션(regular) 60s / 그 외 3600s (마감 직후 정산 창은 60s).
type IndexFetcher = () => Promise<IndexIntradaySnapshot[] | null>;
const fetchers = new Map<string, IndexFetcher>();

const cacheKeyOf = (
  code: DomesticIndexCode,
  session: KrxSession,
  tradingDate: string,
): string => `${code}::${session}::${tradingDate}`;

const cacheTagOf = (code: DomesticIndexCode, session: KrxSession): string =>
  `index-intraday-${code.toLowerCase()}-${session}`;

const getCachedFetcher = (
  code: DomesticIndexCode,
  session: KrxSession,
  tradingDate: string,
  minutesSinceClose: number | null,
): IndexFetcher => {
  const key = cacheKeyOf(code, session, tradingDate);
  const cached = fetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => getIndexIntradayPrices(code),
    ["index-intraday", code, session, tradingDate],
    {
      revalidate: krxIndexRankingRevalidate(session, minutesSinceClose),
      tags: [cacheTagOf(code, session)],
    },
  );
  fetchers.set(key, fresh);
  return fresh;
};

// PromiseSettledResult + null 실패 신호를 합쳐서 정규화. null 이면 evict + failed=true.
// bars 는 항상 배열로 collapse (클라 계약 유지: quotes[code]: IndexIntradaySnapshot[]).
// failed 는 실패↔정상 empty(preopen/휴장) 를 클라이언트에서 구분하는 신호.
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

// 전체 예외 시 계약 유지용 empty. Record 로 조립.
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
  // 요청 시작에서 캘린더 1회 로드 (memo). 세션·거래일·마감 경과 산출에 관통.
  const calendar = await getMarketCalendar();
  const now = new Date();
  const session = getKrxSessionState(now, calendar);
  const tradingDate = getKrxTradingDate(now, calendar);
  const marketOpen = isKrxMarketOpen(now, calendar);
  const sinceClose = minutesSinceKrxClose(now, calendar);

  try {
    const results = await Promise.allSettled(
      DOMESTIC_INDEX_CODES.map((code) =>
        getCachedFetcher(code, session, tradingDate, sinceClose)(),
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
    console.error(`[index-intraday] ${message}`);
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
