import { Suspense } from "react";
import { StockChartSection } from "@/entities/stock/StockChartSection";
import { StockDisclosuresPreview } from "@/entities/stock/StockDisclosuresPreview";
import { ChartSkeleton, DisclosuresSkeleton } from "@/entities/stock/Skeletons";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function OverviewPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <div className="space-y-4">
      <Suspense fallback={<ChartSkeleton />}>
        <StockChartSection ticker={ticker} limit={60} label="최근 3개월" />
      </Suspense>
      <Suspense fallback={<DisclosuresSkeleton />}>
        <StockDisclosuresPreview ticker={ticker} />
      </Suspense>
    </div>
  );
}
