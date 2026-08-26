import type { StockPriceSnapshot } from "@/shared/types/stock";
import { getDailyPrices } from "@/lib/prices";
import { fetchNxEligible } from "@/lib/quoteSnapshots";
import { StockPanel, type StockPanelVariant } from "./StockPanel";
import { StockChartDynamic } from "./StockChartDynamic";

type StockChartSectionProps = {
  ticker: string;
  limit?: number;
  label?: string;
  viewAllHref?: string;
  interactive?: boolean;
  variant?: StockPanelVariant;
};

export const StockChartSection = async ({
  ticker,
  limit,
  label,
  viewAllHref,
  interactive = true,
  variant,
}: StockChartSectionProps) => {
  let prices: StockPriceSnapshot[] = [];
  let hasError = false;

  try {
    prices = await getDailyPrices(ticker, limit ?? 365);
  } catch {
    hasError = true;
  }

  if (hasError) {
    const errorContent = (
      <>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">가격 차트</h2>
        <p className="text-sm text-muted-foreground">차트 데이터를 불러오지 못했습니다</p>
      </>
    );
    return interactive ? errorContent : <StockPanel variant={variant}>{errorContent}</StockPanel>;
  }

  // 미니차트 subscribeOnly 캐시 키를 헤더 폴링과 정합시키기 위해 nxEligible 을 함께 넘긴다.
  // fetchNxEligible 은 React.cache 이므로 layout 의 헤더 조회와 요청 단위 dedupe.
  const nxEligible = await fetchNxEligible(ticker);

  const chart = (
    <StockChartDynamic
      prices={prices}
      ticker={ticker}
      label={label}
      viewAllHref={viewAllHref}
      interactive={interactive}
      nxEligible={nxEligible}
    />
  );

  return interactive ? chart : <StockPanel variant={variant}>{chart}</StockPanel>;
};
