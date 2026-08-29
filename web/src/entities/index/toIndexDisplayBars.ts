import { INDEX_END_LABEL_BOUNDARIES } from "@/shared/constants/chart";
import type { ChartBar, IndexIntradaySnapshot } from "@/shared/types/quote";
import { resampleThenEndLabelBySession } from "@/shared/utils/resampleThenEndLabelBySession";

// snapshot (START 라벨) → 리샘플(N분 버킷) → END 라벨(15:30 경계) ChartBar[].
// interval=1 이면 리샘플 pass-through, END(60) 만 적용해 라벨을 END 로 시프트.
// Chart 상세 · 홈 mini · sparkline 공용.
export const toIndexDisplayBars = (
  snapshots: readonly IndexIntradaySnapshot[],
  intervalMin: number,
): ChartBar[] => {
  const raw: ChartBar[] = snapshots.map((s) => ({
    time: s.timestamp,
    open: s.open,
    high: s.high,
    low: s.low,
    close: s.close,
    volume: s.volume,
  }));
  return resampleThenEndLabelBySession(raw, intervalMin, INDEX_END_LABEL_BOUNDARIES);
};
