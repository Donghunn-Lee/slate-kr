import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getOverseasIndexIntradayPrices } from "@/lib/indices";
import {
  getUsSessionState,
  getUsTradingDate,
  isUsMarketOpen,
  type UsSession,
} from "@/shared/utils/market";
import { usOverseasIntradayRevalidate } from "@/lib/sessionCache";
import {
  OVERSEAS_INTRADAY_CODES,
  type OverseasIntradayCode,
} from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 코드 × usSession × etDate 별 캐시. session·tradingDate 를 key 축에 두어
// ET 세션 경계에서 자동 miss. 정규장 120s / closed 3600s.
// 국내 60s 보다 완만한 이유: 라이브 자체가 ~15분 지연 피드라 짧은 revalidate 이득 없음.
type OverseasFetcher = () => Promise<IndexIntradaySnapshot[] | null>;
const fetchers = new Map<string, OverseasFetcher>();

const cacheKeyOf = (
  code: OverseasIntradayCode,
  session: UsSession,
  tradingDate: string,
): string => `${code}::${session}::${tradingDate}`;

const cacheTagOf = (code: OverseasIntradayCode, session: UsSession): string =>
  `overseas-index-intraday-${code.toLowerCase()}-${session}`;

const getCachedFetcher = (
  code: OverseasIntradayCode,
  session: UsSession,
  tradingDate: string,
): OverseasFetcher => {
  const key = cacheKeyOf(code, session, tradingDate);
  const cached = fetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => getOverseasIndexIntradayPrices(code),
    ["overseas-index-intraday", code, session, tradingDate],
    {
      revalidate: usOverseasIntradayRevalidate(session),
      tags: [cacheTagOf(code, session)],
    },
  );
  fetchers.set(key, fresh);
  return fresh;
};

type OverseasResolveResult = {
  bars: IndexIntradaySnapshot[];
  failed: boolean;
};

const resolve = (
  code: OverseasIntradayCode,
  session: UsSession,
  r: PromiseSettledResult<IndexIntradaySnapshot[] | null>,
): OverseasResolveResult => {
  if (r.status !== "fulfilled" || r.value === null) {
    revalidateTag(cacheTagOf(code, session), { expire: 0 });
    return { bars: [], failed: true };
  }
  return { bars: r.value, failed: false };
};

// 전체 예외 시 계약 유지용 empty. Record 로 조립.
const emptyQuotes = (): Record<OverseasIntradayCode, IndexIntradaySnapshot[]> =>
  Object.fromEntries(
    OVERSEAS_INTRADAY_CODES.map((c) => [c, [] as IndexIntradaySnapshot[]]),
  ) as Record<OverseasIntradayCode, IndexIntradaySnapshot[]>;

const allFailed = (): Record<OverseasIntradayCode, boolean> =>
  Object.fromEntries(OVERSEAS_INTRADAY_CODES.map((c) => [c, true])) as Record<
    OverseasIntradayCode,
    boolean
  >;

export const GET = async () => {
  const session = getUsSessionState();
  const tradingDate = getUsTradingDate();
  const marketOpen = isUsMarketOpen();

  try {
    const results = await Promise.allSettled(
      OVERSEAS_INTRADAY_CODES.map((code) =>
        getCachedFetcher(code, session, tradingDate)(),
      ),
    );
    const resolved = OVERSEAS_INTRADAY_CODES.map(
      (code, i) => [code, resolve(code, session, results[i])] as const,
    );

    const quotes = Object.fromEntries(
      resolved.map(([code, r]) => [code, r.bars]),
    ) as Record<OverseasIntradayCode, IndexIntradaySnapshot[]>;
    const failed = Object.fromEntries(
      resolved.map(([code, r]) => [code, r.failed]),
    ) as Record<OverseasIntradayCode, boolean>;

    return NextResponse.json({ quotes, marketOpen, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[overseas-index-intraday] ${message}`);
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
