import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
import { StockHeader } from "@/entities/stock/StockHeader";
import { StockMetrics } from "@/entities/stock/StockMetrics";
import { HeaderSkeleton, MetricsSkeleton } from "@/entities/stock/Skeletons";
import { RecentSearchRecorder } from "@/features/search/RecentSearchRecorder";
import { StockTabPanel } from "@/entities/stock/StockTabPanel";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
};

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  let stock = null;
  try {
    stock = await getStockByTicker(ticker);
  } catch {
    return { title: "종목을 찾을 수 없습니다" };
  }
  if (!stock) return { title: "종목을 찾을 수 없습니다" };
  return {
    title: `${stock.name} (${ticker})`,
    description: `${stock.name}(${ticker}) 주가, 재무정보, 공시를 확인하세요`,
  };
}

export default async function StockDetailLayout({ children, params }: LayoutProps) {
  const { ticker } = await params;
  let stock = null;
  try {
    stock = await getStockByTicker(ticker);
  } catch {
    notFound();
  }
  if (!stock) notFound();

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <RecentSearchRecorder ticker={ticker} name={stock.name} />
      <Suspense fallback={<HeaderSkeleton />}>
        <StockHeader ticker={ticker} stock={stock} />
      </Suspense>
      <Suspense fallback={<MetricsSkeleton />}>
        <StockMetrics ticker={ticker} />
      </Suspense>
      <StockTabPanel ticker={ticker}>{children}</StockTabPanel>
    </main>
  );
}
