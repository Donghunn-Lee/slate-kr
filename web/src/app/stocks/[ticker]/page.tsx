import { Suspense } from "react";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
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

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { ticker } = await params;
  const stock = await getStockByTicker(ticker);
  if (!stock) return { title: "종목을 찾을 수 없습니다 | SlateKR" };
  return {
    title: `${stock.name}(${ticker}) 종목 정보 | SlateKR`,
    description: `${stock.name}의 주가, 재무, 공시 정보를 한눈에. 차트, 5년 재무 요약, 최근 공시를 제공합니다.`,
  };
};

export default async function OverviewPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <h2 className="text-sm font-semibold text-muted-foreground">종합정보</h2>
        <span className="text-xs font-normal text-muted-foreground/70">
          · 핵심 지표와 가격 정보를 한눈에
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Suspense fallback={<ChartSkeleton />}>
          <StockChartSection
            ticker={ticker}
            limit={60}
            label="최근 3개월"
            viewAllHref={`/stocks/${ticker}/chart`}
            interactive={false}
            variant="lavender"
          />
        </Suspense>
        <Suspense fallback={<FinancialsSkeleton compact />}>
          <StockFinancials ticker={ticker} viewAllHref={`/stocks/${ticker}/financials`} compact />
        </Suspense>
        <Suspense fallback={<DisclosuresSkeleton />}>
          <StockDisclosuresPreview ticker={ticker} />
        </Suspense>
        <Suspense fallback={<PriceStatsSkeleton />}>
          <PriceStatsSection ticker={ticker} />
        </Suspense>
      </div>
    </>
  );
}
