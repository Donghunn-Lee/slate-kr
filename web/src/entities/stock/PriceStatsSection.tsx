import { getPricesForStats, getPriceStats } from "@/lib/prices";
import { PriceStatsCard } from "./PriceStatsCard";

type PriceStatsSectionProps = {
  ticker: string;
};

export const PriceStatsSection = async ({ ticker }: PriceStatsSectionProps) => {
  const prices = await getPricesForStats(ticker);
  const stats = getPriceStats(prices);
  return <PriceStatsCard stats={stats} />;
};
