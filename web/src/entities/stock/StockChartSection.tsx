import type { StockPriceSnapshot } from "@/shared/types/stock";
import { getDailyPrices } from "@/lib/prices";
import { StockChart } from "./StockChart";

type StockChartSectionProps = {
  ticker: string;
};

export const StockChartSection = async ({ ticker }: StockChartSectionProps) => {
  let prices: StockPriceSnapshot[] = [];

  try {
    prices = await getDailyPrices(ticker, 365);
  } catch {
    // DB 오류 시 빈 배열로 폴백
  }

  return <StockChart prices={prices} ticker={ticker} />;
};
