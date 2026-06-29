import { NextResponse } from "next/server";
import { fetchIndexQuote } from "@/lib/kis-quote-fetch";
import { getLatestIndexPrice } from "@/lib/indices";
import { isKrxMarketOpen } from "@/shared/utils/market";
import type { IndexDailySnapshot, IndexQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

type IndexCellData = {
  live: IndexQuote | null;
  fallback: IndexDailySnapshot | null;
};

type IndexQuotes = {
  kospi: IndexCellData;
  kosdaq: IndexCellData;
  kospi200: IndexCellData;
};

const pick = <T>(r: PromiseSettledResult<T | null>): T | null =>
  r.status === "fulfilled" ? r.value : null;

export const GET = async () => {
  try {
    const [
      kospiLive,
      kosdaqLive,
      kospi200Live,
      kospiFb,
      kosdaqFb,
      kospi200Fb,
    ] = await Promise.allSettled([
      fetchIndexQuote("0001"),
      fetchIndexQuote("1001"),
      fetchIndexQuote("2001"),
      getLatestIndexPrice("KOSPI"),
      getLatestIndexPrice("KOSDAQ"),
      getLatestIndexPrice("KOSPI200"),
    ]);

    const quotes: IndexQuotes = {
      kospi: { live: pick(kospiLive), fallback: pick(kospiFb) },
      kosdaq: { live: pick(kosdaqLive), fallback: pick(kosdaqFb) },
      kospi200: { live: pick(kospi200Live), fallback: pick(kospi200Fb) },
    };

    return NextResponse.json({ quotes, marketOpen: isKrxMarketOpen() });
  } catch {
    return NextResponse.json(
      { error: "지수 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
