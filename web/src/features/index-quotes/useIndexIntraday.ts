import { useQuery } from "@tanstack/react-query";
import type { IndexIntradaySnapshot } from "@/shared/types/quote";

export type IndexIntradayResponse = {
  quotes: {
    kospi: IndexIntradaySnapshot[];
    kosdaq: IndexIntradaySnapshot[];
    kospi200: IndexIntradaySnapshot[];
  };
  marketOpen: boolean;
  // route 가 완전 fetch 실패 시 해당 지수 true. bars 는 항상 [] 로 정규화되므로
  // 실패↔정상 empty(preopen/휴장) 를 client 에서 구분하는 유일한 신호. stock-intraday 와 대칭.
  failed: {
    kospi: boolean;
    kosdaq: boolean;
    kospi200: boolean;
  };
};

const POLL_INTERVAL_MS = 60_000;

// 3지수 인트라데이를 단일 폴링으로 가져온다. IndexSlate에서 한 번 호출 → 셀별 분배.
// 직전 응답 marketOpen=true 일 때만 60s 폴링. useIndexQuotes 와 동일 패턴.
export const useIndexIntraday = () =>
  useQuery<IndexIntradayResponse>({
    queryKey: ["index-intraday"],
    queryFn: async () => {
      const res = await fetch("/api/index-intraday");
      if (!res.ok) throw new Error("index intraday fetch failed");
      return res.json();
    },
    refetchInterval: (query) =>
      query.state.data?.marketOpen ? POLL_INTERVAL_MS : false,
  });
