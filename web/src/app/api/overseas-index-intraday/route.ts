import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getOverseasIndexIntradayPrices } from "@/lib/indices";
import { getMarketCalendar } from "@/lib/marketCalendar";
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
// 캐시 단위 = 봉 배열 + 조립 시각. fetchedAt 을 이 안에서 캡처해야 SWR 히트 시 원 조립
// 시각이 그대로 실려 클라가 stale 응답을 판정할 수 있다.
type CachedOverseasBars = { bars: IndexIntradaySnapshot[] | null; fetchedAt: number };
type OverseasFetcher = () => Promise<CachedOverseasBars>;
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
    async () => {
      const bars = await getOverseasIndexIntradayPrices(code, tradingDate);
      return { bars, fetchedAt: Date.now() } satisfies CachedOverseasBars;
    },
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
  fetchedAt: number | null;
};

const resolve = (
  code: OverseasIntradayCode,
  session: OverseasIndexSessionState,
  r: PromiseSettledResult<CachedOverseasBars>,
): OverseasResolveResult => {
  if (r.status !== "fulfilled" || r.value.bars === null) {
    revalidateTag(cacheTagOf(code, session), { expire: 0 });
    return { bars: [], failed: true, fetchedAt: null };
  }
  return { bars: r.value.bars, failed: false, fetchedAt: r.value.fetchedAt };
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
  // 요청 시작에서 캘린더 1회 로드 (memo). 지수별 세션·거래일·마감 경과 산출에 관통.
  const calendar = await getMarketCalendar();
  const now = new Date();
  // 코드별 세션·거래일 산출. marketOpen 은 7종 중 하나라도 regular 면 true —
  // 훅 폴링 게이트가 단일 boolean 이므로 aggregate 유지.
  const perCode = OVERSEAS_INTRADAY_CODES.map((code) => ({
    code,
    session: getOverseasIndexSessionState(code, now, calendar),
    tradingDate: getOverseasIndexTradingDate(code, now, calendar),
    sinceClose: minutesSinceOverseasIndexClose(code, now, calendar),
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
    // 정규장 코드 셀 중 가장 오래된 조립 시각 — 클라 stale 판정 축. closed 코드는 TTL 3600s 라
    // 섞이면 항상 stale 로 보이므로 제외. 정규장 코드가 없으면 null.
    const regularTimes = resolved.flatMap(([, r], i) =>
      perCode[i].session === "regular" && r.fetchedAt !== null ? [r.fetchedAt] : [],
    );
    const fetchedAt = regularTimes.length > 0 ? Math.min(...regularTimes) : null;

    return NextResponse.json({ quotes, marketOpen, failed, fetchedAt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[overseas-index-intraday] ${message}`);
    return NextResponse.json(
      {
        quotes: emptyQuotes(),
        marketOpen: false,
        failed: allFailed(),
        fetchedAt: null,
      },
      { status: 200 },
    );
  }
};
