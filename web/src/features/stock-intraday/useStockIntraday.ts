import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChartBar } from "@/shared/types/quote";
import type { MarketCalendar } from "@/shared/types/marketCalendar";
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
// 차트를 점유한다. session 만 새 응답 것을 쓴다: 개장 전 창 라벨(isKrxOpeningWindow)의 서버
// 축이라 가장 최근 판정을 따르게 한다. 폴링 재개는 아래 클라 시계 축이라 session 과 무관하다.
// 직전 정상본이 없으면(첫 로드·연속 실패) 결손본이 그대로 들어가 failed UI 로 흐른다.
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

// market.ts 의 isKrxActiveSession 을 클라 시계에 얹은 얇은 어댑터 — useStockQuote 와 같은 술어.
const isActiveSession = (calendar?: MarketCalendar) =>
  isKrxActiveSession(getKrxSessionState(new Date(), calendar));

// 클라 시계 기준 60초 폴링 (useStockQuote 헤더 폴링과 같은 축·리듬). 활성(regular/after/pre)
// 일 때만 refetch 하고 그 외엔 틱이 시계만 보고 끝나므로, 개장 전에 연 탭도 09:00 이 지나면
// 다음 틱에서 재개된다. 응답 session 을 축으로 쓰면 폴링이 멈춘 뒤 갱신되지 않아 그 탭이
// 정지 상태에 갇혔다. enabled=false 는 fetch·폴링 모두 차단 (분봉 뷰 밖 트래픽 0).
//
// hidden 탭은 틱을 건너뛴다 — route 는 서버 캐시 없이 KIS 직행이라 보이지 않는 탭의 콜을
// 내지 않는다. 복귀 시 1회 갱신은 refetchOnWindowFocus 가 담당하고, 마감 후 복귀마다 콜이
// 나가지 않도록 같은 시계 축으로 활성 세션에서만 허용.
//
// staleTime:0 + refetchOnMount:'always' — 인트라데이는 초 단위 신선도가 계약이라
// 전역 staleTime(60s) 로컬 override. 재접속 시 캐시된 옛 봉 서빙 차단.
export const useStockIntraday = (
  ticker: string,
  options: UseStockIntradayOptions = {},
) => {
  const { enabled = true } = options;
  const calendar = useMarketCalendar();
  const query = useQuery<StockIntradayResponse>({
    queryKey: ["stock-intraday", ticker],
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: () => isActiveSession(calendar),
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
  });

  const { refetch } = query;
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (isActiveSession(calendar)) void refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, calendar, refetch]);

  return query;
};
