import type { FinancialPeriod } from "@/shared/types/stock";
import { getFinancials } from "@/lib/financials";
import { StockPanel } from "./StockPanel";
import { StockFinancialsClient } from "./StockFinancialsClient";

type StockFinancialsProps = {
  ticker: string;
  viewAllHref?: string;
};

export const StockFinancials = async ({ ticker, viewAllHref }: StockFinancialsProps) => {
  let annual: FinancialPeriod[] = [];
  let quarterly: FinancialPeriod[] = [];
  let hasError = false;

  try {
    const result = await getFinancials(ticker);
    annual = result.annual.slice(0, 5);
    quarterly = result.quarterly.slice(0, 4);
  } catch {
    hasError = true;
  }

  const isEmpty = annual.length === 0 && quarterly.length === 0;

  return (
    <StockPanel variant="sage">
      {hasError ? (
        <>
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">재무 요약</h2>
          <p className="text-sm text-muted-foreground">재무 데이터를 불러오지 못했습니다</p>
        </>
      ) : isEmpty ? (
        <>
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">재무 요약</h2>
          <p className="text-sm text-muted-foreground">재무 데이터 없음</p>
        </>
      ) : (
        <StockFinancialsClient annual={annual} quarterly={quarterly} viewAllHref={viewAllHref} />
      )}
    </StockPanel>
  );
};
