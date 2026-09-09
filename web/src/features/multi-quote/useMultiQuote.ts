import { useQuery } from "@tanstack/react-query";
import { isPreMarketReset } from "@/entities/stock/stockHeaderLabel";
import { useMarketCalendar } from "@/shared/contexts/MarketCalendarContext";
import { useNow } from "@/shared/hooks/useNow";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

export type MultiQuoteResponse = {
  quotes: Record<string, StockQuote | null>;
  // per-code KIS 실패 신호. route catch collapse 시엔 요청 전 티커 true.
  // stock-quote(#077) single failed flag의 Record 확장 — 소비측이 종목별로 분기.
  failed: Record<string, boolean>;
  marketOpen: boolean;
  session: KrxSession;
  // 요청 시각 기준 KRX 거래일. quote 가 속한 거래일과는 별개 축이다.
  tradingDate: string;
};

const POLL_INTERVAL_MS = 60_000;

// KIS 멀티 견적 상한(FHKST11300006, 30). route/fetcher 는 초과분을 silent truncate 하므로
// 라이브 소비측이 명시적으로 slice 해서 EOD 폴백으로 흐르게 한다.
export const LIVE_TICKER_LIMIT = 30;

// 정렬+중복제거된 join 키. 순서·중복 무관하게 동일 queryKey가 되도록.
const buildKey = (tickers: string[]): string =>
  [...new Set(tickers)].sort().join(",");

type UseMultiQuoteResult = {
  quotes: Record<string, StockQuote | null>;
  failed: Record<string, boolean>;
  marketOpen: boolean;
  session: KrxSession | undefined;
  tradingDate: string | undefined;
  // 개장 전 창(08:00~09:00)의 KRX 0% 리셋 여부. 소비측은 EOD 폴백 팔에만 얹는다 —
  // 라이브 값이 있으면 오늘 축이라 손대지 않는다.
  preReset: boolean;
  isLoading: boolean;
};

// 직전 응답의 marketOpen=true일 때만 60초 주기 폴링. 폐장 시 정지.
export const useMultiQuote = (tickers: string[]): UseMultiQuoteResult => {
  const key = buildKey(tickers);
  // 종목 헤더(StockHeaderLivePrice)와 같은 시계·캘린더 축. 새 컨텍스트를 만들지 않는다.
  const now = useNow();
  const calendar = useMarketCalendar();

  const query = useQuery<MultiQuoteResponse>({
    queryKey: ["multi-quote", key],
    queryFn: async () => {
      const res = await fetch(`/api/multi-quote?tickers=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error("multi quote fetch failed");
      return res.json();
    },
    enabled: tickers.length > 0,
    refetchInterval: (q) => (q.state.data?.marketOpen ? POLL_INTERVAL_MS : false),
  });

  return {
    quotes: query.data?.quotes ?? {},
    // route가 200을 보장하므로 정상 경로에선 항상 채워짐. 초기/인프라 5xx(Vercel timeout 등)
    // throw 경로에선 {} — 소비측은 미지("이 티커의 실패 여부 알 수 없음")로 취급.
    failed: query.data?.failed ?? {},
    marketOpen: query.data?.marketOpen ?? false,
    session: query.data?.session,
    tradingDate: query.data?.tradingDate,
    // market 은 "krx" 고정 — 리스트 표면엔 KRX/NXT 탭 축이 없고, 리셋이 걸리는 EOD 폴백
    // 값 자체가 daily_prices(=KRX) 축이다. 응답 전 session=undefined 는 술어가 false 로
    // 받아 헤더의 pre-mount 동작과 동형.
    preReset: isPreMarketReset(query.data?.session, "krx", now, calendar),
    isLoading: query.isLoading,
  };
};
