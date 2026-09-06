import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchIndexQuote } from "@/lib/kis-quote-fetch";
import { getLatestIndexPrice } from "@/lib/indices";
import { getMarketCalendar } from "@/lib/marketCalendar";
import {
  getKrxSessionState,
  getKrxTradingDate,
  isKrxMarketOpen,
  minutesSinceKrxClose,
  type KrxSession,
} from "@/shared/utils/market";
import { krxIndexRankingRevalidate } from "@/lib/sessionCache";
import {
  DOMESTIC_INDEX_CODES,
  type DomesticIndexCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot, IndexQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// KIS 지수 시세 코드 (KOSPI/KOSDAQ/KOSPI200/KOSDAQ150).
type IndexKisCode = "0001" | "1001" | "2001" | "3003";
const KIS_BY_DOMESTIC: Record<DomesticIndexCode, IndexKisCode> = {
  KOSPI: "0001",
  KOSDAQ: "1001",
  KOSPI200: "2001",
  KOSDAQ150: "3003",
};

// 지수 코드 × session × krxDate 별 unstable_cache 래퍼를 memoize.
// session·tradingDate 를 key 축에 두어 세션·일 경계에서 자동 miss 를 보장한다.
// TTL: 활성 세션(regular) 60s / 그 외 3600s (마감 직후 정산 창은 60s).
// null(호출 실패) 도 그대로 캐시 = KIS backpressure. 실패 시 tag evict 로 정리.
// 캐시 단위 = 셀 데이터 조립 단위. fetchedAt 을 이 안에서 캡처해야 캐시 히트 시
// 원 조립 시각이 그대로 유지된다.
type CachedIndexCell = { live: IndexQuote | null; fetchedAt: number };
type IndexQuoteFetcher = () => Promise<CachedIndexCell>;
const quoteFetchers = new Map<string, IndexQuoteFetcher>();

const cacheKeyOf = (
  code: IndexKisCode,
  session: KrxSession,
  tradingDate: string,
): string => `${code}::${session}::${tradingDate}`;

const cacheTagOf = (code: IndexKisCode, session: KrxSession): string =>
  `index-quote-${code}-${session}`;

const getCachedQuote = (
  code: IndexKisCode,
  session: KrxSession,
  tradingDate: string,
  minutesSinceClose: number | null,
): IndexQuoteFetcher => {
  const key = cacheKeyOf(code, session, tradingDate);
  const cached = quoteFetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    async () => {
      const live = await fetchIndexQuote(code);
      return { live, fetchedAt: Date.now() } satisfies CachedIndexCell;
    },
    ["index-quote", code, session, tradingDate],
    {
      revalidate: krxIndexRankingRevalidate(session, minutesSinceClose),
      tags: [cacheTagOf(code, session)],
    },
  );
  quoteFetchers.set(key, fresh);
  return fresh;
};

type IndexCellData = {
  live: IndexQuote | null;
  fallback: IndexDailySnapshot | null;
  // 셀 데이터를 조립한 시각 (epoch ms).
  fetchedAt: number;
};

const pick = <T>(r: PromiseSettledResult<T | null>): T | null =>
  r.status === "fulfilled" ? r.value : null;

// null 실패 신호 시 세션 tag evict — stale null 재서빙 방지.
const resolveCell = (
  code: IndexKisCode,
  session: KrxSession,
  r: PromiseSettledResult<CachedIndexCell>,
): CachedIndexCell | null => {
  const value = pick(r);
  if (value === null || value.live === null) {
    revalidateTag(cacheTagOf(code, session), { expire: 0 });
  }
  return value;
};

export const GET = async () => {
  // 요청 시작에서 캘린더 1회 로드 (memo). 세션·거래일·마감 경과·marketOpen 산출에 관통.
  const calendar = await getMarketCalendar();
  const now = new Date();
  const session = getKrxSessionState(now, calendar);
  const tradingDate = getKrxTradingDate(now, calendar);
  const sinceClose = minutesSinceKrxClose(now, calendar);

  try {
    const [liveResults, fallbackResults] = await Promise.all([
      Promise.allSettled(
        DOMESTIC_INDEX_CODES.map((code) =>
          getCachedQuote(KIS_BY_DOMESTIC[code], session, tradingDate, sinceClose)(),
        ),
      ),
      Promise.allSettled(
        DOMESTIC_INDEX_CODES.map((code) => getLatestIndexPrice(code)),
      ),
    ]);

    const quotes = Object.fromEntries(
      DOMESTIC_INDEX_CODES.map((code, i) => {
        const cached = resolveCell(KIS_BY_DOMESTIC[code], session, liveResults[i]);
        return [
          code,
          {
            live: cached?.live ?? null,
            fallback: pick(fallbackResults[i]),
            // 캐시 단위가 reject 된 경우에만 요청 시각으로 대체 — fetchIndexQuote 는
            // 내부 catch 로 null 을 반환하므로 사실상 도달하지 않는다.
            fetchedAt: cached?.fetchedAt ?? now.getTime(),
          } satisfies IndexCellData,
        ];
      }),
    ) as Record<DomesticIndexCode, IndexCellData>;

    return NextResponse.json({
      quotes,
      marketOpen: isKrxMarketOpen(now, calendar),
      session,
      date: tradingDate,
    });
  } catch {
    return NextResponse.json(
      { error: "지수 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
