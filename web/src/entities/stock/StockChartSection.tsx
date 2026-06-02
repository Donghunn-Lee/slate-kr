import type { StockPriceSnapshot } from "@/shared/types/stock";
import { getDailyPrices } from "@/lib/prices";
import { StockPanel } from "./StockPanel";
import { StockChartDynamic } from "./StockChartDynamic";

type StockChartSectionProps = {
  ticker: string;
  limit?: number;
  label?: string;
  viewAllHref?: string;
};

export const StockChartSection = async ({
  ticker,
  limit,
  label,
  viewAllHref,
}: StockChartSectionProps) => {
  let prices: StockPriceSnapshot[] = [];
  let hasError = false;

  try {
    prices = await getDailyPrices(ticker, limit ?? 365);
  } catch {
    hasError = true;
  }

  if (hasError) {
    return (
      <StockPanel>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-sm text-muted-foreground">차트 데이터를 불러오지 못했습니다</p>
      </StockPanel>
    );
  }

  return (
    <StockChartDynamic prices={prices} ticker={ticker} label={label} viewAllHref={viewAllHref} />
  );
};
