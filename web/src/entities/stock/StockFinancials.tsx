import type { FinancialPeriod } from "@/shared/types/stock";
import { getFinancials } from "@/lib/financials";
import { StockPanel } from "./StockPanel";
import { StockFinancialsClient } from "./StockFinancialsClient";

type StockFinancialsProps = {
  ticker: string;
  viewAllHref?: string;
  compact?: boolean;
};

export const StockFinancials = async ({ ticker, viewAllHref, compact }: StockFinancialsProps) => {
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

  const content = hasError ? (
    <>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">재무 요약</h2>
      <p className="text-sm text-muted-foreground">재무 데이터를 불러오지 못했습니다</p>
    </>
  ) : isEmpty ? (
    <>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">재무 요약</h2>
      <p className="text-sm text-muted-foreground">재무 데이터 없음</p>
    </>
  ) : (
    <StockFinancialsClient
      annual={compact ? annual.slice(0, 2) : annual}
      quarterly={compact ? quarterly.slice(0, 2) : quarterly}
      viewAllHref={viewAllHref}
      compact={compact}
    />
  );

  return compact ? <StockPanel variant="amber">{content}</StockPanel> : content;
};
