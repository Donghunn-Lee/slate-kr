import { useQuery } from "@tanstack/react-query";
import type { DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export type IndexIntraday1mResponse = {
  quotes: Record<DomesticIndexCode, IndexIntradaySnapshot[]>;
  marketOpen: boolean;
  // route 가 완전 fetch 실패 시 해당 지수 true. bars 는 항상 [] 로 정규화되므로
  // 실패↔정상 empty(preopen/휴장) 를 client 에서 구분하는 유일한 신호.
  failed: Record<DomesticIndexCode, boolean>;
};

const POLL_INTERVAL_MS = 60_000;

// 직전 응답 marketOpen=true 일 때만 60s 폴링, 장 마감 시 정지.
export const useIndexIntraday1m = () =>
  useQuery<IndexIntraday1mResponse>({
    queryKey: ["index-intraday-1m"],
    queryFn: async () => {
      const res = await fetch("/api/index-intraday-1m");
      if (!res.ok) throw new Error("index intraday 1m fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });
