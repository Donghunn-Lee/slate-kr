import type { StockFinancialSummary } from "@/shared/types/stock";
import { getFinancials } from "@/lib/financials";
import { formatFinancial } from "@/shared/format";
import { StockPanel } from "./StockPanel";

type FinancialRowProps = {
  financial: StockFinancialSummary;
};

const FinancialRow = ({ financial }: FinancialRowProps) => (
  <tr className="border-b last:border-0">
    <td className="py-3 text-sm font-medium">{financial.year}년</td>
    <td className="py-3 text-right text-sm tabular-nums">{formatFinancial(financial.revenue)}</td>
    <td className="py-3 text-right text-sm tabular-nums">
      {formatFinancial(financial.operatingProfit)}
    </td>
    <td className="py-3 text-right text-sm tabular-nums">{formatFinancial(financial.netIncome)}</td>
  </tr>
);

type StockFinancialsProps = {
  ticker: string;
};

export const StockFinancials = async ({ ticker }: StockFinancialsProps) => {
  let annuals: StockFinancialSummary[] = [];

  try {
    const all = await getFinancials(ticker);
    annuals = all.filter((f) => f.reportType === "annual").slice(0, 3);
  } catch {
    // DB 오류 시 빈 데이터로 폴백
  }

  return (
    <StockPanel variant="financials">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">재무 요약 (연간)</h2>
      {annuals.length === 0 ? (
        <p className="text-sm text-muted-foreground">재무 데이터 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left text-xs font-medium text-muted-foreground">연도</th>
                <th className="pb-2 text-right text-xs font-medium text-muted-foreground">매출</th>
                <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                  영업이익
                </th>
                <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                  당기순이익
                </th>
              </tr>
            </thead>
            <tbody>
              {annuals.map((f) => (
                <FinancialRow key={f.year} financial={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StockPanel>
  );
};
