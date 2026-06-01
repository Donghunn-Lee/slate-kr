import { Suspense } from "react";
import { StockChartSection } from "@/entities/stock/StockChartSection";
import { ChartSkeleton } from "@/entities/stock/Skeletons";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function ChartPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <StockChartSection ticker={ticker} limit={250} label="최근 1년" />
    </Suspense>
  );
}
