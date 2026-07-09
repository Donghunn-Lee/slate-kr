import { useQuery } from "@tanstack/react-query";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

export type MultiQuoteResponse = {
  quotes: Record<string, StockQuote | null>;
  // per-code KIS 실패 신호. route catch collapse 시엔 요청 전 티커 true.
  // stock-quote(#077) single failed flag의 Record 확장 — 소비측이 종목별로 분기.
  failed: Record<string, boolean>;
  marketOpen: boolean;
  session: KrxSession;
};

const POLL_INTERVAL_MS = 60_000;

// 정렬+중복제거된 join 키. 순서·중복 무관하게 동일 queryKey가 되도록.
const buildKey = (tickers: string[]): string =>
  [...new Set(tickers)].sort().join(",");

type UseMultiQuoteResult = {
  quotes: Record<string, StockQuote | null>;
  failed: Record<string, boolean>;
  marketOpen: boolean;
  session: KrxSession | undefined;
  isLoading: boolean;
};

// 직전 응답의 marketOpen=true일 때만 60초 주기 폴링. 폐장 시 정지.
export const useMultiQuote = (tickers: string[]): UseMultiQuoteResult => {
  const key = buildKey(tickers);

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
    isLoading: query.isLoading,
  };
};
