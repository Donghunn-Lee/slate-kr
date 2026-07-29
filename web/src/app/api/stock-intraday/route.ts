import { revalidateTag, unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import {
  fetchStockIntradayChart,
  type StockIntradayChartResult,
} from "@/lib/kis-quote-fetch";
import {
  getKrxSessionState,
  getKrxTradingDate,
  type KrxSession,
} from "@/shared/utils/market";

export const dynamic = "force-dynamic";

// 세션·거래일 스코프 캐시. probe #102 확정:
//   기존 open/closed 이분 tag 는 after(15:30~20:00) 를 3600s 로 묶어 stale 을 유발했고,
//   preopen 두 창(06:00~08:00, 08:50~09:00) 사이 캐시가 넘어가 F38(월요일 pre 창에서
//   Friday closed 봉 서빙) 뿌리와 동일. 키에 session + tradingDate 를 넣어 전환 시
//   자동 miss 를 보장한다.
// TTL:
//   활성 세션(regular/after/pre) — 60s (헤더 폴링과 동일 리듬)
//   preopen — 600s (조기 창 캐시가 늦은 창까지 살아남지 않게 50분 미만으로 강제)
//   after_close / closed — 3600s (완결 데이터, 세션 스코프 miss 로 이미 안전)
const openFetchers = new Map<
  string,
  () => Promise<StockIntradayChartResult | null>
>();

const cacheKeyOf = (
  ticker: string,
  session: KrxSession,
  tradingDate: string,
): string => `${ticker}::${session}::${tradingDate}`;

const cacheTagOf = (ticker: string, session: KrxSession): string =>
  `stock-intraday-${ticker}-${session}`;

const revalidateOf = (session: KrxSession): number => {
  if (session === "regular" || session === "after" || session === "pre") return 60;
  if (session === "preopen") return 600;
  return 3600; // after_close / closed
};

const getCachedFetcher = (
  ticker: string,
  session: KrxSession,
  tradingDate: string,
): (() => Promise<StockIntradayChartResult | null>) => {
  const key = cacheKeyOf(ticker, session, tradingDate);
  const cached = openFetchers.get(key);
  if (cached) return cached;
  const tag = cacheTagOf(ticker, session);
  const fresh = unstable_cache(
    () => fetchStockIntradayChart(ticker),
    ["stock-intraday", ticker, session, tradingDate],
    { revalidate: revalidateOf(session), tags: [tag] },
  );
  openFetchers.set(key, fresh);
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
  // fallback 응답 date — 실패 시 세션 기준 오늘/직전 거래일. 성공 시 result.tradingDate 사용.
  const fallbackDate = getKrxTradingDate();

  try {
    const result = await getCachedFetcher(ticker, session, fallbackDate)();
    // null = fetch 실패 (자격/토큰/전체 fan-out 실패). 캐시에 null 이 그대로 저장됐으므로
    // 다음 요청이 stale null 을 받지 않도록 즉시 evict. 응답 body 는 [] 로 정규화해
    // 클라 계약(bars: ChartBar[]) 유지. failed:true 로 정상 empty 와 구분.
    if (result === null) {
      revalidateTag(cacheTagOf(ticker, session), { expire: 0 });
      return NextResponse.json({
        bars: [],
        session,
        date: fallbackDate,
        previousDay: false,
        failed: true,
      });
    }
    return NextResponse.json({
      bars: result.bars,
      session,
      date: result.tradingDate,
      previousDay: result.previousDay,
      failed: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stock-intraday] ${message}`);
    return NextResponse.json(
      {
        bars: [],
        session,
        date: fallbackDate,
        previousDay: false,
        failed: true,
      },
      { status: 200 },
    );
  }
};
