import {
  getIndexEndLabelBoundaries,
} from "@/shared/constants/chart";
import type { IndexCode } from "@/shared/constants/indices";
import type { ChartBar, IndexIntradaySnapshot } from "@/shared/types/quote";
import { resampleThenEndLabelBySession } from "@/shared/utils/resampleThenEndLabelBySession";

// snapshot (START 라벨) → 리샘플(N분 버킷) → END 라벨(코드별 마감 경계) ChartBar[].
// interval=1 이면 리샘플 pass-through, END 만 적용해 라벨을 END 로 시프트.
// Chart 상세 · 홈 mini · sparkline 공용. 국내는 15:30 단일, 해외는 지수별 마감 시각.
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
  return resampleThenEndLabelBySession(
    raw,
    intervalMin,
    getIndexEndLabelBoundaries(code),
  );
};
