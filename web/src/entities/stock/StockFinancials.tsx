import type { FinancialPeriod } from "@/shared/types/stock";
import { getFinancials } from "@/lib/financials";
import { StockPanel } from "./StockPanel";
import { StockFinancialsClient } from "./StockFinancialsClient";

type StockFinancialsProps = {
  ticker: string;
};

export const StockFinancials = async ({ ticker }: StockFinancialsProps) => {
  let annual: FinancialPeriod[] = [];
  let quarterly: FinancialPeriod[] = [];

  try {
    const result = await getFinancials(ticker);
    annual = result.annual.slice(0, 5);
    quarterly = result.quarterly.slice(0, 4);
  } catch {
    // DB 오류 시 빈 데이터로 폴백
  }

  const isEmpty = annual.length === 0 && quarterly.length === 0;

  return (
    <StockPanel variant="sage">
      {isEmpty ? (
        <>
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">재무 요약</h2>
          <p className="text-sm text-muted-foreground">재무 데이터 없음</p>
        </>
      ) : (
        <StockFinancialsClient annual={annual} quarterly={quarterly} />
      )}
    </StockPanel>
  );
};
