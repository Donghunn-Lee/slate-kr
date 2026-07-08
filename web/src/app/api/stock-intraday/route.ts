import { revalidateTag, unstable_cache } from "next/cache";
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
// tag: session 별로 분리한다 (open 실패가 closed 스냅샷을 evict 하지 않도록, 반대도).
const openFetchers = new Map<string, () => Promise<ChartBar[] | null>>();
const closedFetchers = new Map<string, () => Promise<ChartBar[] | null>>();

const cacheTag = (ticker: string, marketOpen: boolean): string =>
  `stock-intraday-${ticker}-${marketOpen ? "open" : "closed"}`;

const getCachedFetcher = (
  ticker: string,
  marketOpen: boolean,
): (() => Promise<ChartBar[] | null>) => {
  const map = marketOpen ? openFetchers : closedFetchers;
  const cached = map.get(ticker);
  if (cached) return cached;
  const tag = cacheTag(ticker, marketOpen);
  const fresh = unstable_cache(
    () => fetchStockIntradayChart(ticker),
    ["stock-intraday", ticker, marketOpen ? "open" : "closed"],
    { revalidate: marketOpen ? 60 : 3600, tags: [tag] },
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
    // null = fetch 실패 (자격/토큰/전체 fan-out 실패). 캐시에 null 이 그대로 저장됐으므로
    // 다음 요청이 stale null 을 받지 않도록 즉시 evict. 응답 body 는 [] 로 정규화해
    // 클라 계약(bars: ChartBar[]) 유지. failed:true 로 정상 empty 와 구분.
    if (bars === null) {
      revalidateTag(cacheTag(ticker, marketOpen), { expire: 0 });
      return NextResponse.json({
        bars: [],
        marketOpen,
        session,
        date,
        failed: true,
      });
    }
    return NextResponse.json({ bars, marketOpen, session, date, failed: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stock-intraday] ${message}`);
    return NextResponse.json(
      { bars: [], marketOpen, session, date, failed: true },
      { status: 200 },
    );
  }
};
