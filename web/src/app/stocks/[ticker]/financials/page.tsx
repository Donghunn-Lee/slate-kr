import { Suspense } from "react";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
import { StockFinancials } from "@/entities/stock/StockFinancials";
import { FinancialsSkeleton } from "@/entities/stock/Skeletons";

export const revalidate = 43200;

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { ticker } = await params;
  const stock = await getStockByTicker(ticker);
  if (!stock) return { title: "종목을 찾을 수 없습니다 | SlateKR" };
  return {
    title: `${stock.name}(${ticker}) 재무 정보 | SlateKR`,
    description: `${stock.name}의 5년 연간 및 분기 재무제표 주요 지표를 제공합니다.`,
  };
};

export default async function FinancialsPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <Suspense fallback={<FinancialsSkeleton />}>
      <StockFinancials ticker={ticker} />
    </Suspense>
  );
}
