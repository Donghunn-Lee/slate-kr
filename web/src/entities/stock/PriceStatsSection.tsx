import type { PriceStats } from "@/shared/types/stock";
import { getPricesForStats, getPriceStats } from "@/lib/prices";
import { PriceStatsCard } from "./PriceStatsCard";
import { StockPanel } from "./StockPanel";

type PriceStatsSectionProps = {
  ticker: string;
};

export const PriceStatsSection = async ({ ticker }: PriceStatsSectionProps) => {
  let stats: PriceStats | null = null;
  let hasError = false;

  try {
    const prices = await getPricesForStats(ticker);
    stats = getPriceStats(prices);
  } catch {
    hasError = true;
  }

  if (hasError || !stats) {
    return (
      <StockPanel variant="sage">
        <h2 className="mb-3 text-body font-semibold text-muted-foreground">가격 통계</h2>
        <p className="text-body text-muted-foreground">가격 통계 데이터를 불러오지 못했습니다</p>
      </StockPanel>
    );
  }

  return <PriceStatsCard stats={stats} />;
};
