import type { IndexDailySnapshot } from "@/shared/types/quote";
import { INDEX_LABEL, type IndexCode } from "@/shared/constants/indices";
import { StockPanel } from "@/entities/stock/StockPanel";
import { IndexChartDynamic } from "./IndexChartDynamic";

type IndexChartSectionProps = {
  indexCode: IndexCode;
  // 상위에서 3지수 병렬 fetch 후 주입. null = 해당 지수 fetch 실패.
  prices: IndexDailySnapshot[] | null;
};

export const IndexChartSection = ({ indexCode, prices }: IndexChartSectionProps) => {
  if (prices === null) {
    return (
      <StockPanel>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {INDEX_LABEL[indexCode]}
        </h2>
        <p className="text-sm text-muted-foreground">차트 데이터를 불러오지 못했습니다</p>
      </StockPanel>
    );
  }

  return (
    <StockPanel>
      <IndexChartDynamic indexCode={indexCode} prices={prices} />
    </StockPanel>
  );
};
