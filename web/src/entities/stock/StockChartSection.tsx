import type { StockPriceSnapshot } from "@/shared/types/stock";
import { getDailyPrices } from "@/lib/prices";
import { StockPanel } from "./StockPanel";
import { StockChart } from "./StockChart";

type StockChartSectionProps = {
  ticker: string;
};

export const StockChartSection = async ({ ticker }: StockChartSectionProps) => {
  let prices: StockPriceSnapshot[] = [];
  let hasError = false;

  try {
    prices = await getDailyPrices(ticker, 365);
  } catch {
    hasError = true;
  }

  if (hasError) {
    return (
      <StockPanel noBorder>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">차트</h2>
        <p className="text-sm text-muted-foreground">차트 데이터를 불러오지 못했습니다</p>
      </StockPanel>
    );
  }

  return <StockChart prices={prices} ticker={ticker} />;
};
