import { revalidateTag, unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getIndexIntradayPrices } from "@/lib/indices";
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

// 지수 코드 × session × krxDate 별 unstable_cache 래퍼 memoize.
// F41(stock-intraday) 패턴 확장: 기존 open/closed 이분 tag 는 after(15:30~20:00) 를
// 3600s 로 묶어 stale 유발했고 tradingDate 부재로 preopen 진입 시 어제 봉 재사용 위험.
// 키에 session + tradingDate 를 넣어 세션·일 경계에서 자동 miss 를 보장한다.
// TTL: 활성 세션(regular) 60s / 그 외 3600s.
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
): IndexFetcher => {
  const key = cacheKeyOf(code, session, tradingDate);
  const cached = fetchers.get(key);
  if (cached) return cached;
  const fresh = unstable_cache(
    () => getIndexIntradayPrices(code),
    ["index-intraday", code, session, tradingDate],
    {
      revalidate: krxIndexRankingRevalidate(session),
      tags: [cacheTagOf(code, session)],
    },
  );
  fetchers.set(key, fresh);
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
    const [kospi, kosdaq, kospi200, kosdaq150] = results;

    const kospiR = resolve("KOSPI", session, kospi);
    const kosdaqR = resolve("KOSDAQ", session, kosdaq);
    const kospi200R = resolve("KOSPI200", session, kospi200);
    const kosdaq150R = resolve("KOSDAQ150", session, kosdaq150);

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
