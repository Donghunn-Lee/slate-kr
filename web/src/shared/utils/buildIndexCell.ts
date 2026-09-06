import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
  IndexQuote,
} from "@/shared/types/quote";
import type { IndexCellData } from "@/features/index-quotes/useIndexQuotes";
import type { KrxSession } from "@/shared/utils/market";

export type BuildIndexCellInput = {
  isDomestic: boolean;
  // IndexQuote.name 주입 (INDEX_LABEL[code]).
  name: string;
  // 국내: /api/index-quotes 응답의 코드별 셀. loading 중이면 undefined 전달.
  domesticCell: IndexCellData | undefined;
  // 해외 라이브 quote (/api/overseas-index-quotes 응답). null = 응답 실패/부재.
  // .DJI 처럼 output2 head 가 없어 time=null 인 경우도 이 인자로 전달 (값은 유효).
  overseasQuote?: IndexQuote | null;
  // 해외 intraday 지수의 최신 봉. .DJI(intraday 미지원)나 응답 없음이면 null.
  overseasLatestBar: IndexIntradaySnapshot | null;
  // EOD fallback. SSR 로 항상 확보되지만 만일 없으면 null.
  latestDaily: IndexDailySnapshot | null;
  // 국내 KRX 세션. pre/preopen 창에서 live 등락이 KIS pre quote 그대로 0 으로
  // 오는 것을 fallback(직전 세션 실등락)으로 스왑하는 데 사용. 미전달 시 스왑 없음.
  session?: KrxSession;
};

// IndexDetailPane / IndexRail / IndexChipStrip / IndexSlate 공용.
// 우선순위:
//   1. 국내 → /api/index-quotes 셀 그대로 (응답이 이미 live+fallback 합성).
//      단 pre/preopen 창은 live.change 가 KIS pre quote 원본상 0 이므로
//      fallback.change/changeRate 로 스왑 — 사용자가 보는 값은 "직전 세션 실등락".
//   2. 해외 quote → 8종 라이브 셀. 값·time 모두 이 소스가 진실.
//   3. 해외 intraday 봉 → quote 부재 시 fallback (SPX/COMP/NDX 만 존재).
//   4. EOD daily → 라이브 소스 전부 없음 시 fallback.
//   5. 없음 → undefined.
export const buildIndexCell = ({
  isDomestic,
  name,
  domesticCell,
  overseasQuote,
  overseasLatestBar,
  latestDaily,
  session,
}: BuildIndexCellInput): IndexCellData | undefined => {
  if (isDomestic) {
    if (!domesticCell) return domesticCell;
    if (
      (session === "pre" || session === "preopen") &&
      domesticCell.live &&
      domesticCell.fallback
    ) {
      const { change, changeRate } = domesticCell.fallback;
      return {
        live: {
          ...domesticCell.live,
          change,
          changeRate,
          sign: change > 0 ? "up" : change < 0 ? "down" : "flat",
        },
        fallback: domesticCell.fallback,
        fetchedAt: domesticCell.fetchedAt,
      };
    }
    return domesticCell;
  }
  if (overseasQuote) {
    return {
      // quote.name 은 KIS 응답 hts_kor_isnm — 호출측 name(INDEX_LABEL[code]) 을 우선.
      live: { ...overseasQuote, name },
      fallback: null,
      fetchedAt: null,
    };
  }
  if (overseasLatestBar) {
    return {
      live: {
        name,
        price: overseasLatestBar.close,
        change: overseasLatestBar.change,
        changeRate: overseasLatestBar.changeRate,
        sign:
          overseasLatestBar.change > 0
            ? "up"
            : overseasLatestBar.change < 0
              ? "down"
              : "flat",
        open: overseasLatestBar.open,
        high: overseasLatestBar.high,
        low: overseasLatestBar.low,
        advCount: 0,
        declCount: 0,
        time: null,
      },
      fallback: null,
      fetchedAt: null,
    };
  }
  if (latestDaily) return { live: null, fallback: latestDaily, fetchedAt: null };
  return undefined;
};
