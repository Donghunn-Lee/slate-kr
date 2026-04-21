import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
import { StockHeader } from "@/entities/stock/StockHeader";
import { StockMetrics } from "@/entities/stock/StockMetrics";
import { StockFinancials } from "@/entities/stock/StockFinancials";
import { StockDisclosures } from "@/entities/stock/StockDisclosures";
import { StockChartSection } from "@/entities/stock/StockChartSection";
import {
  HeaderSkeleton,
  MetricsSkeleton,
  ChartSkeleton,
  FinancialsSkeleton,
  DisclosuresSkeleton,
} from "@/entities/stock/Skeletons";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

// 동일 요청 내에서 getStockByTicker 중복 DB 호출 방지
const getStock = cache(getStockByTicker);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const stock = await getStock(ticker);
  if (!stock) return { title: "종목을 찾을 수 없습니다" };
  return {
    title: `${stock.name} (${ticker})`,
    description: `${stock.name}(${ticker}) 주가, 재무정보, 공시를 확인하세요`,
  };
}

async function StockDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const stock = await getStock(ticker);

  if (!stock) notFound();

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <Suspense fallback={<HeaderSkeleton />}>
        <StockHeader ticker={ticker} stock={stock} />
      </Suspense>

      <Suspense fallback={<MetricsSkeleton />}>
        <StockMetrics ticker={ticker} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <StockChartSection ticker={ticker} />
      </Suspense>

      <Suspense fallback={<FinancialsSkeleton />}>
        <StockFinancials ticker={ticker} />
      </Suspense>

      <Suspense fallback={<DisclosuresSkeleton />}>
        <StockDisclosures ticker={ticker} />
      </Suspense>
    </main>
  );
}

export default StockDetailPage;
