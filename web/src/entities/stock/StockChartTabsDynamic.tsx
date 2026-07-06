"use client";

import dynamic from "next/dynamic";
import type { StockPriceSnapshot } from "@/shared/types/stock";

const StockChartTabsInner = dynamic(
  () => import("./StockChartTabs").then((m) => ({ default: m.StockChartTabs })),
  {
    ssr: false,
    loading: () => <div className="h-[348px] rounded-xl border bg-elevated" />,
  },
);

type StockChartTabsDynamicProps = {
  ticker: string;
  prices: StockPriceSnapshot[];
};

export const StockChartTabsDynamic = (props: StockChartTabsDynamicProps) => (
  <StockChartTabsInner {...props} />
);
