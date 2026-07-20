import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchIndexQuote } from "@/lib/kis-quote-fetch";
import { getLatestIndexPrice } from "@/lib/indices";
import { getKrxTradingDate, isKrxMarketOpen } from "@/shared/utils/market";
import type { IndexDailySnapshot, IndexQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// 지수 코드별 unstable_cache 키 분리. 유저 선형 3N 콜을 인스턴스당 60s 3콜로 상수화.
// keyParts에 반드시 지수 코드 포함 — 안 넣으면 세 지수가 같은 엔트리를 공유한다.
// null(호출 실패) 도 그대로 60s 캐시 = KIS backpressure. index-intraday와 동일 패턴.
const getCachedIndexQuote = {
  "0001": unstable_cache(
    () => fetchIndexQuote("0001"),
    ["index-quote-kospi"],
    { revalidate: 60 },
  ),
  "1001": unstable_cache(
    () => fetchIndexQuote("1001"),
    ["index-quote-kosdaq"],
    { revalidate: 60 },
  ),
  "2001": unstable_cache(
    () => fetchIndexQuote("2001"),
    ["index-quote-kospi200"],
    { revalidate: 60 },
  ),
  "3003": unstable_cache(
    () => fetchIndexQuote("3003"),
    ["index-quote-kosdaq150"],
    { revalidate: 60 },
  ),
} as const;

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

export const GET = async () => {
  try {
    const [
      kospiLive,
      kosdaqLive,
      kospi200Live,
      kosdaq150Live,
      kospiFb,
      kosdaqFb,
      kospi200Fb,
      kosdaq150Fb,
    ] = await Promise.allSettled([
      getCachedIndexQuote["0001"](),
      getCachedIndexQuote["1001"](),
      getCachedIndexQuote["2001"](),
      getCachedIndexQuote["3003"](),
      getLatestIndexPrice("KOSPI"),
      getLatestIndexPrice("KOSDAQ"),
      getLatestIndexPrice("KOSPI200"),
      getLatestIndexPrice("KOSDAQ150"),
    ]);

    const quotes: IndexQuotes = {
      kospi: { live: pick(kospiLive), fallback: pick(kospiFb) },
      kosdaq: { live: pick(kosdaqLive), fallback: pick(kosdaqFb) },
      kospi200: { live: pick(kospi200Live), fallback: pick(kospi200Fb) },
      kosdaq150: { live: pick(kosdaq150Live), fallback: pick(kosdaq150Fb) },
    };

    return NextResponse.json({
      quotes,
      marketOpen: isKrxMarketOpen(),
      date: getKrxTradingDate(),
    });
  } catch {
    return NextResponse.json(
      { error: "지수 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
