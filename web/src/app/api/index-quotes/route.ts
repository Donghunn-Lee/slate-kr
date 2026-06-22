import { NextResponse } from "next/server";
import { fetchIndexQuote } from "@/lib/kis-quote-fetch";
import { isKrxMarketOpen } from "@/shared/utils/market";
import type { IndexQuote } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

type IndexQuotes = {
  kospi: IndexQuote | null;
  kosdaq: IndexQuote | null;
  kospi200: IndexQuote | null;
};

const pick = (r: PromiseSettledResult<IndexQuote | null>): IndexQuote | null =>
  r.status === "fulfilled" ? r.value : null;

export const GET = async () => {
  try {
    const [kospi, kosdaq, kospi200] = await Promise.allSettled([
      fetchIndexQuote("0001"),
      fetchIndexQuote("1001"),
      fetchIndexQuote("2001"),
    ]);

    const quotes: IndexQuotes = {
      kospi: pick(kospi),
      kosdaq: pick(kosdaq),
      kospi200: pick(kospi200),
    };

    return NextResponse.json({ quotes, marketOpen: isKrxMarketOpen() });
  } catch {
    return NextResponse.json(
      { error: "지수 시세를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
};
