import { unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { fetchStockIntradayChart } from "@/lib/kis-quote-fetch";
import {
  getKrxSessionState,
  getKrxTradingDate,
  isKrxMarketOpen,
} from "@/shared/utils/market";
import type { ChartBar } from "@/shared/types/quote";

export const dynamic = "force-dynamic";

// ticker별 캐시 분리. 장중 60s, 그 외(폐장/최근거래일 스냅샷) 3600s.
// unstable_cache 래퍼는 안정 참조가 필요하므로 티커/상태별로 memoize.
const openFetchers = new Map<string, () => Promise<ChartBar[]>>();
const closedFetchers = new Map<string, () => Promise<ChartBar[]>>();

const getCachedFetcher = (
  ticker: string,
  marketOpen: boolean,
): (() => Promise<ChartBar[]>) => {
  const map = marketOpen ? openFetchers : closedFetchers;
  const cached = map.get(ticker);
  if (cached) return cached;
  const fresh = unstable_cache(
    async () => (await fetchStockIntradayChart(ticker)) ?? [],
    ["stock-intraday", ticker, marketOpen ? "open" : "closed"],
    { revalidate: marketOpen ? 60 : 3600 },
  );
  map.set(ticker, fresh);
  return fresh;
};

export const GET = async (req: NextRequest) => {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker 파라미터가 필요합니다" },
      { status: 400 },
    );
  }

  const session = getKrxSessionState();
  const marketOpen = isKrxMarketOpen();
  const date = getKrxTradingDate();

  try {
    const bars = await getCachedFetcher(ticker, marketOpen)();
    return NextResponse.json({ bars, marketOpen, session, date });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stock-intraday] ${message}`);
    return NextResponse.json(
      { bars: [], marketOpen, session, date },
      { status: 200 },
    );
  }
};
