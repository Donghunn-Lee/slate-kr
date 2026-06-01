import { Suspense } from "react";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
import { StockChartSection } from "@/entities/stock/StockChartSection";
import { ChartSkeleton } from "@/entities/stock/Skeletons";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { ticker } = await params;
  const stock = await getStockByTicker(ticker);
  if (!stock) return { title: "종목을 찾을 수 없습니다 | SlateKR" };
  return {
    title: `${stock.name}(${ticker}) 차트 | SlateKR`,
    description: `${stock.name}의 일별 주가 차트와 거래 추이를 확인하세요.`,
  };
};

export default async function ChartPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <StockChartSection ticker={ticker} limit={250} label="최근 1년" />
    </Suspense>
  );
}
