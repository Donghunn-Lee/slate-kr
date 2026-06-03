"use client";

import dynamic from "next/dynamic";
import type { StockPriceSnapshot } from "@/shared/types/stock";
const StockChartInner = dynamic(
  () => import("./StockChart").then((m) => ({ default: m.StockChart })),
  { ssr: false, loading: () => <div className="h-[380px] rounded-xl border bg-elevated" /> }
);

type StockChartDynamicProps = {
  prices: StockPriceSnapshot[];
  ticker: string;
  label?: string;
  viewAllHref?: string;
  interactive?: boolean;
};

export const StockChartDynamic = (props: StockChartDynamicProps) => <StockChartInner {...props} />;
