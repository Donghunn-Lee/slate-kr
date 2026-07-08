import { useQuery } from "@tanstack/react-query";
import type { ChartBar } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

export type StockIntradayResponse = {
  bars: ChartBar[];
  marketOpen: boolean;
  session: KrxSession;
  date: string; // KST 거래일 'YYYY-MM-DD'
  // route 가 완전 fetch 실패 시 true. bars 는 항상 [] 로 정규화되므로
  // 실패↔정상 empty(pre/휴장/tradingDate 불일치) 를 client 에서 구분하는 유일한 신호.
  failed: boolean;
};

type UseStockIntradayOptions = {
  enabled?: boolean;
};

const POLL_INTERVAL_MS = 60_000;

// 직전 응답 marketOpen=true (정규장 중) 일 때만 60초 폴링. 그 외 정지.
// enabled=false 로 탭 미활성 상태의 백그라운드 폴링을 차단.
// useIndexIntraday 와 동일 패턴에 옵션만 추가.
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
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });
