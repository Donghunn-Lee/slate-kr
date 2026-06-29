import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { getIndexIntradayPrices } from "@/lib/indices";
import { isKrxMarketOpen } from "@/shared/utils/market";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

type IndexQuotes = {
  kospi: IndexIntradaySnapshot[];
  kosdaq: IndexIntradaySnapshot[];
  kospi200: IndexIntradaySnapshot[];
};

// 지수별로 unstable_cache 키를 분리. KIS rate limit 보호 + 60초 윈도 내 동일 인스턴스
// 중복 호출 방지. 60초 폴링에 정확히 맞물린다.
const getCached = {
  KOSPI: unstable_cache(
    () => getIndexIntradayPrices("KOSPI"),
    ["index-intraday-kospi"],
    { revalidate: 60 },
  ),
  KOSDAQ: unstable_cache(
    () => getIndexIntradayPrices("KOSDAQ"),
    ["index-intraday-kosdaq"],
    { revalidate: 60 },
  ),
  KOSPI200: unstable_cache(
    () => getIndexIntradayPrices("KOSPI200"),
    ["index-intraday-kospi200"],
    { revalidate: 60 },
  ),
} as const;

const pick = (r: PromiseSettledResult<IndexIntradaySnapshot[]>): IndexIntradaySnapshot[] =>
  r.status === "fulfilled" ? r.value : [];

export const GET = async () => {
  try {
    const [kospi, kosdaq, kospi200] = await Promise.allSettled([
      getCached.KOSPI(),
      getCached.KOSDAQ(),
      getCached.KOSPI200(),
    ]);

    const quotes: IndexQuotes = {
      kospi: pick(kospi),
      kosdaq: pick(kosdaq),
      kospi200: pick(kospi200),
    };

    return NextResponse.json({ quotes, marketOpen: isKrxMarketOpen() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[index-intraday] ${message}`);
    return NextResponse.json(
      {
        quotes: { kospi: [], kosdaq: [], kospi200: [] },
        marketOpen: false,
      },
      { status: 200 },
    );
  }
};
