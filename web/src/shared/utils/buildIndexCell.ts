import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
} from "@/shared/types/quote";
import type { IndexCellData } from "@/features/index-quotes/useIndexQuotes";

export type BuildIndexCellInput = {
  isDomestic: boolean;
  // IndexQuote.name 주입 (INDEX_LABEL[code]).
  name: string;
  // 국내: /api/index-quotes 응답의 코드별 셀. loading 중이면 undefined 전달.
  domesticCell: IndexCellData | undefined;
  // 해외 intraday 지수의 최신 봉. .DJI(intraday 미지원)나 응답 없음이면 null.
  overseasLatestBar: IndexIntradaySnapshot | null;
  // EOD fallback. SSR 로 항상 확보되지만 만일 없으면 null.
  latestDaily: IndexDailySnapshot | null;
};

// IndexDetailPane / IndexRail 해외 분기 공용. 해외 라이브(quote)는 IndexSlate 가 직접
// useOverseasIndexQuotes 결과를 소비하므로 이 헬퍼를 거치지 않는다.
// 우선순위:
//   1. 국내 → /api/index-quotes 셀 그대로 (해당 응답이 이미 live+fallback 합성).
//   2. 해외 intraday 봉 존재 → 최신 봉의 close/change/changeRate 를 live 로 승격.
//   3. EOD daily → fallback 만 채운 셀.
//   4. 없음 → undefined (소비자가 "데이터 없음" 렌더).
export const buildIndexCell = ({
  isDomestic,
  name,
  domesticCell,
  overseasLatestBar,
  latestDaily,
}: BuildIndexCellInput): IndexCellData | undefined => {
  if (isDomestic) return domesticCell;
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
      },
      fallback: null,
    };
  }
  if (latestDaily) return { live: null, fallback: latestDaily };
  return undefined;
};
