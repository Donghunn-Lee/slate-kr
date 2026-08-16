import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchIndexQuote } from "@/lib/kis-quote-fetch";
import { getLatestIndexPrice } from "@/lib/indices";
import {
  getKrxSessionState,
  getKrxTradingDate,
  isKrxMarketOpen,
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
// TTL: 활성 세션(regular) 60s / 그 외 3600s.
// null(호출 실패) 도 그대로 캐시 = KIS backpressure. 실패 시 tag evict 로 정리.
type IndexQuoteFetcher = () => Promise<IndexQuote | null>;
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
): IndexQuoteFetcher => {
  const key = cacheKeyOf(code, session, tradingDate);
  const cached = quoteFetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => fetchIndexQuote(code),
    ["index-quote", code, session, tradingDate],
    {
      revalidate: krxIndexRankingRevalidate(session),
      tags: [cacheTagOf(code, session)],
    },
  );
  quoteFetchers.set(key, fresh);
  return fresh;
};

type IndexCellData = {
  live: IndexQuote | null;
  fallback: IndexDailySnapshot | null;
};

const pick = <T>(r: PromiseSettledResult<T | null>): T | null =>
  r.status === "fulfilled" ? r.value : null;

// null 실패 신호 시 세션 tag evict — stale null 재서빙 방지.
const resolveLive = (
  code: IndexKisCode,
  session: KrxSession,
  r: PromiseSettledResult<IndexQuote | null>,
): IndexQuote | null => {
  const value = pick(r);
  if (value === null) {
    revalidateTag(cacheTagOf(code, session), { expire: 0 });
  }
  return value;
};

export const GET = async () => {
  const session = getKrxSessionState();
  const tradingDate = getKrxTradingDate();

  try {
    const [liveResults, fallbackResults] = await Promise.all([
      Promise.allSettled(
        DOMESTIC_INDEX_CODES.map((code) =>
          getCachedQuote(KIS_BY_DOMESTIC[code], session, tradingDate)(),
        ),
      ),
      Promise.allSettled(
        DOMESTIC_INDEX_CODES.map((code) => getLatestIndexPrice(code)),
      ),
    ]);

    const quotes = Object.fromEntries(
      DOMESTIC_INDEX_CODES.map((code, i) => [
        code,
        {
          live: resolveLive(KIS_BY_DOMESTIC[code], session, liveResults[i]),
          fallback: pick(fallbackResults[i]),
        } satisfies IndexCellData,
      ]),
    ) as Record<DomesticIndexCode, IndexCellData>;

    return NextResponse.json({
      quotes,
      marketOpen: isKrxMarketOpen(),
      date: tradingDate,
    });
  } catch {
    return NextResponse.json(
      { error: "지수 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
