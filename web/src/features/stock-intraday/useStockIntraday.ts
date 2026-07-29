import { useQuery } from "@tanstack/react-query";
import type { ChartBar } from "@/shared/types/quote";
import { isKrxActiveSession, type KrxSession } from "@/shared/utils/market";

export type StockIntradayResponse = {
  bars: ChartBar[];
  session: KrxSession;
  date: string; // KST 거래일 'YYYY-MM-DD' — bars 가 실제로 속한 거래일
  // true = 전일 스냅샷 fallback (preopen 아침·비NXT 늦은 프리오픈·주말·공휴일).
  // client 는 이 신호로 "정규장 개장 전 · MM-DD 마감 차트" 라벨을 붙이고 baseline 을 비활성.
  previousDay: boolean;
  // route 가 완전 fetch 실패 시 true. bars 는 항상 [] 로 정규화되므로
  // 실패↔정상 empty(pre/휴장/tradingDate 불일치) 를 client 에서 구분하는 유일한 신호.
  failed: boolean;
};

type UseStockIntradayOptions = {
  enabled?: boolean;
};

const POLL_INTERVAL_MS = 60_000;

// 응답 session 이 활성(regular/after/pre)이면 60초 폴링. 그 외 정지.
// isKrxActiveSession 을 useStockQuote(헤더 폴링) 와 공유해 두 훅이 동일 리듬으로 움직인다.
// enabled=false 로 탭 미활성 상태의 백그라운드 폴링을 차단.
export const useStockIntraday = (
  ticker: string,
  options: UseStockIntradayOptions = {},
) =>
  useQuery<StockIntradayResponse>({
    queryKey: ["stock-intraday", ticker],
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const res = await fetch(
        `/api/stock-intraday?ticker=${encodeURIComponent(ticker)}`,
      );
      if (!res.ok) throw new Error("stock intraday fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      isKrxActiveSession(query.state.data?.session) ? POLL_INTERVAL_MS : false,
  });
