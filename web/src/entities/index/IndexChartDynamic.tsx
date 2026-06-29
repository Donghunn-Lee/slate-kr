"use client";

import dynamic from "next/dynamic";
import type { IndexDailySnapshot } from "@/shared/types/quote";

const IndexChartInner = dynamic(
  () => import("./IndexChart").then((m) => ({ default: m.IndexChart })),
  { ssr: false, loading: () => <div className="h-[348px] rounded-xl border bg-elevated" /> }
);

type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";

type IndexChartDynamicProps = {
  indexCode: IndexCode;
  prices: IndexDailySnapshot[];
  interactive?: boolean;
};

export const IndexChartDynamic = (props: IndexChartDynamicProps) => (
  <IndexChartInner {...props} />
);
