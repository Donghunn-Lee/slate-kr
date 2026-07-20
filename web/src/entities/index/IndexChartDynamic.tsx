"use client";

import dynamic from "next/dynamic";
import type { DomesticIndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

const IndexChartInner = dynamic(
  () => import("./IndexChart").then((m) => ({ default: m.IndexChart })),
  { ssr: false, loading: () => <div className="h-[498px] rounded-xl border bg-elevated" /> }
);

type IndexChartDynamicProps = {
  indexCode: DomesticIndexCode;
  prices: IndexDailySnapshot[];
  interactive?: boolean;
};

export const IndexChartDynamic = (props: IndexChartDynamicProps) => (
  <IndexChartInner {...props} />
);
