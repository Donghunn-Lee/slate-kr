import { Suspense } from "react";
import type { Metadata } from "next";
import { getStockByTicker } from "@/lib/stocks";
import { getDailyPrices } from "@/lib/prices";
import { StockChartTabsDynamic } from "@/entities/stock/StockChartTabsDynamic";
import { ChartTabsSkeleton } from "@/entities/stock/Skeletons";
import type { StockPriceSnapshot } from "@/shared/types/stock";

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
    description: `${stock.name}의 인트라데이·일봉·월봉 차트를 확인하세요.`,
  };
};

const ChartTabsSection = async ({ ticker }: { ticker: string }) => {
  let prices: StockPriceSnapshot[] = [];
  let hasError = false;
  try {
    // 전체 일봉 커버 (실측 max ≈ 3046봉). 사용자는 툴바로 표시 창을 조정.
    prices = await getDailyPrices(ticker, 4000);
  } catch {
    hasError = true;
  }

  if (hasError) {
    return (
      <>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-sm text-muted-foreground">차트 데이터를 불러오지 못했습니다</p>
      </>
    );
  }

  return <StockChartTabsDynamic ticker={ticker} prices={prices} />;
};

export default async function ChartPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <Suspense fallback={<ChartTabsSkeleton />}>
      <ChartTabsSection ticker={ticker} />
    </Suspense>
  );
}
