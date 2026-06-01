import { Suspense } from "react";
import { StockChartSection } from "@/entities/stock/StockChartSection";
import { StockDisclosuresPreview } from "@/entities/stock/StockDisclosuresPreview";
import { StockFinancials } from "@/entities/stock/StockFinancials";
import { PriceStatsSection } from "@/entities/stock/PriceStatsSection";
import {
  ChartSkeleton,
  DisclosuresSkeleton,
  FinancialsSkeleton,
  PriceStatsSkeleton,
} from "@/entities/stock/Skeletons";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function OverviewPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Suspense fallback={<ChartSkeleton />}>
        <StockChartSection
          ticker={ticker}
          limit={60}
          label="최근 3개월"
          viewAllHref={`/stocks/${ticker}/chart`}
        />
      </Suspense>
      <Suspense fallback={<FinancialsSkeleton />}>
        <StockFinancials ticker={ticker} viewAllHref={`/stocks/${ticker}/financials`} compact />
      </Suspense>
      <Suspense fallback={<DisclosuresSkeleton />}>
        <StockDisclosuresPreview ticker={ticker} />
      </Suspense>
      <Suspense fallback={<PriceStatsSkeleton />}>
        <PriceStatsSection ticker={ticker} />
      </Suspense>
    </div>
  );
}
