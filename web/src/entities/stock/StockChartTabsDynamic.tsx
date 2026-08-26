"use client";

import dynamic from "next/dynamic";
import type { StockPriceSnapshot } from "@/shared/types/stock";

const StockChartTabsInner = dynamic(
  () => import("./StockChartTabs").then((m) => ({ default: m.StockChartTabs })),
  {
    ssr: false,
    // 툴바(랩되면 2행) + 차트 높이(mobile 320 / desktop 450) 근사.
    // StockChartTabs 내부 상수 변경 시 여기도 함께 조정 — 레이아웃 점프 방지 목적.
    loading: () => (
      <div className="h-[400px] rounded-xl border bg-elevated sm:h-[498px]" />
    ),
  },
);

type StockChartTabsDynamicProps = {
  ticker: string;
  prices: StockPriceSnapshot[];
  nxEligible: boolean | null;
};

export const StockChartTabsDynamic = (props: StockChartTabsDynamicProps) => (
  <StockChartTabsInner {...props} />
);
