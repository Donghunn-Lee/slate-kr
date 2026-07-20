"use client";

import dynamic from "next/dynamic";
import type { IndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

const IndexChartInner = dynamic(
  () => import("./IndexChart").then((m) => ({ default: m.IndexChart })),
  { ssr: false, loading: () => <div className="h-[498px] rounded-xl border bg-elevated" /> }
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
