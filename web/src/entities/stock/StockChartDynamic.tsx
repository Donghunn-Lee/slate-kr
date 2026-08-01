"use client";

import dynamic from "next/dynamic";
import type { StockPriceSnapshot } from "@/shared/types/stock";
// Skeleton 높이는 헤더행(~30px) + 실제 차트 높이(mobile 170 / desktop 300) 근사.
// StockChart 내부 상수 변경 시 여기도 함께 조정 — 레이아웃 점프 방지 목적.
const StockChartInner = dynamic(
  () => import("./StockChart").then((m) => ({ default: m.StockChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[210px] rounded-xl border bg-elevated sm:h-[340px]" />
    ),
  }
);

type StockChartDynamicProps = {
  prices: StockPriceSnapshot[];
  ticker: string;
  label?: string;
  viewAllHref?: string;
  interactive?: boolean;
};

export const StockChartDynamic = (props: StockChartDynamicProps) => <StockChartInner {...props} />;
