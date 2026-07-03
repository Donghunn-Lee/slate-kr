import { useQuery } from "@tanstack/react-query";
import type { ChartBar } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";

export type StockIntradayResponse = {
  bars: ChartBar[];
  marketOpen: boolean;
  session: KrxSession;
  date: string; // KST 거래일 'YYYY-MM-DD'
};

const POLL_INTERVAL_MS = 60_000;

// 직전 응답 marketOpen=true (정규장 중) 일 때만 60초 폴링. 그 외 정지.
// useIndexIntraday 와 동일 패턴.
export const useStockIntraday = (ticker: string) =>
  useQuery<StockIntradayResponse>({
    queryKey: ["stock-intraday", ticker],
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
