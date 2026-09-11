import { useQuery } from "@tanstack/react-query";
import type { ChartBar } from "@/shared/types/quote";
import { useMarketCalendar } from "@/shared/contexts/MarketCalendarContext";
import {
  getKrxSessionState,
  isKrxActiveSession,
  type KrxSession,
} from "@/shared/utils/market";

export type StockIntradayResponse = {
  bars: ChartBar[];
  session: KrxSession;
  date: string; // KST 거래일 'YYYY-MM-DD' — bars 가 실제로 속한 거래일
  // true = 전일 스냅샷 fallback (preopen 아침·비NXT 늦은 프리오픈·주말·공휴일).
  // client 는 이 신호로 "정규장 개장 전 · MM-DD 마감 차트" 라벨을 붙이고 baseline 을 비활성.
  previousDay: boolean;
  // route 가 fetch 에 실패하면 true — 자격/토큰 실패(bars []) 와 anchor 부분 실패(성공
  // anchor 봉만 실린 결손본) 모두. 실패↔정상 empty(pre/휴장/tradingDate 불일치) 를
  // client 에서 구분하는 유일한 신호.
  failed: boolean;
};

// failed 응답이 캐시의 직전 정상본을 덮지 않게 한다 — 응답은 통째 교체라 결손본이 다음 폴까지
// 차트를 점유한다. session 만 새 응답 것을 쓴다: refetchInterval 게이트 축이라 직전본이
// after_close 였으면 활성 세션에 들어와도 폴링이 닫힌 채 갇힌다. 직전 정상본이 없으면
// (첫 로드·연속 실패) 결손본이 그대로 들어가 failed UI 로 흐른다.
export const keepLastGoodIntraday = (
  prev: StockIntradayResponse | undefined,
  next: StockIntradayResponse,
): StockIntradayResponse =>
  next.failed && prev !== undefined && !prev.failed
    ? { ...prev, session: next.session }
    : next;

type UseStockIntradayOptions = {
  enabled?: boolean;
};

const POLL_INTERVAL_MS = 60_000;

// 응답 session 이 활성(regular/after/pre)이면 60초 폴링. 그 외 정지.
// isKrxActiveSession 을 useStockQuote(헤더 폴링) 와 공유해 두 훅이 동일 리듬으로 움직인다.
// enabled=false 로 탭 미활성 상태의 백그라운드 폴링을 차단.
//
// staleTime:0 + refetchOnMount:'always' — 인트라데이는 초 단위 신선도가 계약이라
// 전역 staleTime(60s) 로컬 override. 재접속 시 캐시된 옛 봉 서빙 차단.
//
// refetchOnWindowFocus — hidden 탭은 interval tick 을 건너뛰므로 복귀 시 1회 즉시 refetch
// 가 폴링 재개 경로. route 는 서버 캐시 없이 KIS 직행이라 마감 후 복귀마다 콜이 나가지
// 않도록 활성 세션에서만 허용. 축은 클라 시계 — 응답 session 은 폴링이 멈춘 뒤 갱신되지
// 않아 preopen 에 로드된 탭이 09:00 이후 복귀해도 정지 상태에 갇힌다.
export const useStockIntraday = (
  ticker: string,
  options: UseStockIntradayOptions = {},
) => {
  const calendar = useMarketCalendar();
  return useQuery<StockIntradayResponse>({
    queryKey: ["stock-intraday", ticker],
    enabled: options.enabled ?? true,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: () =>
      isKrxActiveSession(getKrxSessionState(new Date(), calendar)),
    queryFn: async ({ client, queryKey }) => {
      const res = await fetch(
        `/api/stock-intraday?ticker=${encodeURIComponent(ticker)}`,
      );
      if (!res.ok) throw new Error("stock intraday fetch failed");
      return keepLastGoodIntraday(
        client.getQueryData<StockIntradayResponse>(queryKey),
        await res.json(),
      );
    },
    refetchInterval: (query) =>
      isKrxActiveSession(query.state.data?.session) ? POLL_INTERVAL_MS : false,
  });
};
