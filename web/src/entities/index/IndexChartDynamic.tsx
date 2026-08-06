"use client";

import dynamic from "next/dynamic";
import type { IndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

// 스켈레톤 높이 산식:
//   mobile:  툴바 h-6(24) + mb-3(12) + 차트 320 = 356
//   desktop: 툴바 h-7(28) + mb-3(12) + 차트 450 = 490
// IndexChart 의 CHART_HEIGHT_* / chartToolbar TOOLBAR_GROUP_CLS 높이 변경 시 동기 필요.
const IndexChartInner = dynamic(
  () => import("./IndexChart").then((m) => ({ default: m.IndexChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[356px] rounded-xl border bg-elevated sm:h-[490px]" />
    ),
  },
);

type IndexChartDynamicProps = {
  indexCode: IndexCode;
  prices: IndexDailySnapshot[];
  interactive?: boolean;
  intradayEnabled?: boolean;
};

export const IndexChartDynamic = (props: IndexChartDynamicProps) => (
  <IndexChartInner {...props} />
);
