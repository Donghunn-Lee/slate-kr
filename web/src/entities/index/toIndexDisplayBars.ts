import { INDEX_END_LABEL_BOUNDARIES } from "@/shared/constants/chart";
import { getIndexMeta, type IndexCode } from "@/shared/constants/indices";
import type { ChartBar, IndexIntradaySnapshot } from "@/shared/types/quote";
import { resampleIntradayBars } from "@/shared/utils/resampleIntradayBars";
import { resampleThenEndLabelBySession } from "@/shared/utils/resampleThenEndLabelBySession";

// snapshot → N분 리샘플 ChartBar[]. Chart 상세 · 홈 mini · sparkline 공용.
// 국내는 END 라벨로 시프트(15:30 경계), 해외는 KIS HTS 관례에 맞춰 START 라벨 유지.
export const toIndexDisplayBars = (
  snapshots: readonly IndexIntradaySnapshot[],
  intervalMin: number,
  code: IndexCode,
): ChartBar[] => {
  const raw: ChartBar[] = snapshots.map((s) => ({
    time: s.timestamp,
    open: s.open,
    high: s.high,
    low: s.low,
    close: s.close,
    volume: s.volume,
  }));
  if (getIndexMeta(code).region === "overseas") {
    return resampleIntradayBars(raw, intervalMin);
  }
  return resampleThenEndLabelBySession(raw, intervalMin, INDEX_END_LABEL_BOUNDARIES);
};
