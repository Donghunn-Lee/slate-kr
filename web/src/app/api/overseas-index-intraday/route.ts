import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getOverseasIndexIntradayPrices } from "@/lib/indices";
import {
  getOverseasIndexSessionState,
  getOverseasIndexTradingDate,
  minutesSinceOverseasIndexClose,
  type OverseasIndexSessionState,
} from "@/shared/utils/market";
import { overseasIntradayRevalidate } from "@/lib/sessionCache";
import {
  OVERSEAS_INTRADAY_CODES,
  type OverseasIntradayCode,
} from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 코드 × 거래소세션 × 거래일 별 캐시. session·tradingDate 를 지수별 축(거래소 TZ)
// 으로 산출해 각 시장 경계에서 자동 miss. 정규장 120s / closed 3600s.
// US 3종·아시아 3종·DAX 동일 경로 — `OVERSEAS_INTRADAY_CODES` 화이트리스트에서 파생.
type OverseasFetcher = () => Promise<IndexIntradaySnapshot[] | null>;
const fetchers = new Map<string, OverseasFetcher>();

const cacheKeyOf = (
  code: OverseasIntradayCode,
  session: OverseasIndexSessionState,
  tradingDate: string,
): string => `${code}::${session}::${tradingDate}`;

const cacheTagOf = (
  code: OverseasIntradayCode,
  session: OverseasIndexSessionState,
): string => `overseas-index-intraday-${code.toLowerCase()}-${session}`;

const getCachedFetcher = (
  code: OverseasIntradayCode,
  session: OverseasIndexSessionState,
  tradingDate: string,
  minutesSinceClose: number | null,
): OverseasFetcher => {
  const key = cacheKeyOf(code, session, tradingDate);
  const cached = fetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => getOverseasIndexIntradayPrices(code, tradingDate),
    ["overseas-index-intraday", code, session, tradingDate],
    {
      revalidate: overseasIntradayRevalidate(session, minutesSinceClose),
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
  session: OverseasIndexSessionState,
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
  // 코드별 세션·거래일 산출. marketOpen 은 7종 중 하나라도 regular 면 true —
  // 훅 폴링 게이트가 단일 boolean 이므로 aggregate 유지.
  const perCode = OVERSEAS_INTRADAY_CODES.map((code) => ({
    code,
    session: getOverseasIndexSessionState(code),
    tradingDate: getOverseasIndexTradingDate(code),
    sinceClose: minutesSinceOverseasIndexClose(code),
  }));
  const marketOpen = perCode.some((p) => p.session === "regular");

  try {
    const results = await Promise.allSettled(
      perCode.map(({ code, session, tradingDate, sinceClose }) =>
        getCachedFetcher(code, session, tradingDate, sinceClose)(),
      ),
    );
    const resolved = perCode.map(
      ({ code, session }, i) => [code, resolve(code, session, results[i])] as const,
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
