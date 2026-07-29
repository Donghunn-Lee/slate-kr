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
import type { IndexDailySnapshot, IndexQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// KIS 지수 시세 코드 (KOSPI/KOSDAQ/KOSPI200/KOSDAQ150).
type IndexKisCode = "0001" | "1001" | "2001" | "3003";
const INDEX_KIS_CODES = ["0001", "1001", "2001", "3003"] as const;

// 지수 코드 × session × krxDate 별 unstable_cache 래퍼를 memoize.
// F41(stock-intraday) 패턴 확장: session·tradingDate 를 key 축으로 넣어
// 세션·일 경계에서 자동 miss. 활성 세션(regular) 60s / 그 외 3600s.
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

type IndexQuotes = {
  kospi: IndexCellData;
  kosdaq: IndexCellData;
  kospi200: IndexCellData;
  kosdaq150: IndexCellData;
};

const pick = <T>(r: PromiseSettledResult<T | null>): T | null =>
  r.status === "fulfilled" ? r.value : null;

// null 실패 신호 시 세션 tag evict — stale null 재서빙 방지 (stock-intraday 동형).
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
        INDEX_KIS_CODES.map((code) =>
          getCachedQuote(code, session, tradingDate)(),
        ),
      ),
      Promise.allSettled([
        getLatestIndexPrice("KOSPI"),
        getLatestIndexPrice("KOSDAQ"),
        getLatestIndexPrice("KOSPI200"),
        getLatestIndexPrice("KOSDAQ150"),
      ]),
    ]);
    const [kospiLive, kosdaqLive, kospi200Live, kosdaq150Live] = liveResults;
    const [kospiFb, kosdaqFb, kospi200Fb, kosdaq150Fb] = fallbackResults;

    const quotes: IndexQuotes = {
      kospi: {
        live: resolveLive("0001", session, kospiLive),
        fallback: pick(kospiFb),
      },
      kosdaq: {
        live: resolveLive("1001", session, kosdaqLive),
        fallback: pick(kosdaqFb),
      },
      kospi200: {
        live: resolveLive("2001", session, kospi200Live),
        fallback: pick(kospi200Fb),
      },
      kosdaq150: {
        live: resolveLive("3003", session, kosdaq150Live),
        fallback: pick(kosdaq150Fb),
      },
    };

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
