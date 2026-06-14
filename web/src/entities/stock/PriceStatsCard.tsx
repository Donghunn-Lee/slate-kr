import type { PriceStats } from "@/shared/types/stock";
import { formatPrice } from "@/shared/format";
import { cn } from "@/lib/utils";
import { StockPanel } from "./StockPanel";

type PriceStatsCardProps = {
  stats: PriceStats;
};

const formatReturn = (value: number): string => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const returnColorClass = (value: number | null): string => {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-price-up";
  if (value < 0) return "text-price-down";
  return "text-price-neutral";
};

export const PriceStatsCard = ({ stats }: PriceStatsCardProps) => {
  const { range52w, returns } = stats;
  const isEmpty = range52w === null && returns.every((r) => r.value === null);

  return (
    <StockPanel variant="sage">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">가격 통계</h2>
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">가격 통계 데이터 없음</p>
      ) : (
        <div className="space-y-5">
          {range52w !== null ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-muted-foreground">52주 레인지</span>
                <span className="text-lg font-semibold">{formatPrice(range52w.current)}</span>
              </div>
              <div className="space-y-1.5">
                <div className="relative py-1.5">
                  <div className="h-1.5 rounded-full bg-sage-border" />
                  <div
                    className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-sage-accent"
                    style={{ left: `${range52w.position * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatPrice(range52w.low)}</span>
                  <span>{formatPrice(range52w.high)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">52주 레인지 없음</p>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">기간 수익률</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {returns.map(({ period, value }) => (
                <div key={period} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{period}</p>
                  <p className={cn("text-sm font-semibold", returnColorClass(value))}>
                    {value === null ? "—" : formatReturn(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </StockPanel>
  );
};
