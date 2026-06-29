import type { IndexDailySnapshot } from "@/shared/types/quote";
import { getIndexDailyPrices } from "@/lib/indices";
import { StockPanel } from "@/entities/stock/StockPanel";
import { IndexChartDynamic } from "./IndexChartDynamic";

type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";

type IndexChartSectionProps = {
  indexCode: IndexCode;
  limit?: number;
};

const INDEX_LABEL: Record<IndexCode, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  KOSPI200: "코스피200",
};

export const IndexChartSection = async ({ indexCode, limit }: IndexChartSectionProps) => {
  let prices: IndexDailySnapshot[] = [];
  let hasError = false;

  try {
    prices = await getIndexDailyPrices(indexCode, limit ?? 365);
  } catch {
    hasError = true;
  }

  if (hasError) {
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
