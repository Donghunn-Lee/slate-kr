import { StockPanel } from "./StockPanel";

export const HeaderSkeleton = () => (
  <StockPanel noBorder className="animate-pulse">
    <div className="flex items-start justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-7 w-32 rounded bg-muted" />
        <div className="h-5 w-14 rounded bg-muted" />
        <div className="h-5 w-14 rounded bg-muted" />
      </div>
      <div className="h-8 w-24 shrink-0 rounded bg-muted" />
    </div>
    <div className="mt-3 h-10 w-40 rounded bg-muted" />
    <div className="mt-3 flex flex-wrap gap-4">
      <div className="h-5 w-24 rounded bg-muted" />
      <div className="h-5 w-28 rounded bg-muted" />
      <div className="h-5 w-24 rounded bg-muted" />
    </div>
  </StockPanel>
);

export const MetricsSkeleton = () => (
  <StockPanel variant="peach" className="animate-pulse">
    <div className="mb-4 flex items-center justify-between">
      <div className="h-5 w-24 rounded bg-muted" />
      <div className="h-5 w-5 rounded bg-muted" />
    </div>
    <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="h-3.5 w-10 rounded bg-muted" />
          <div className="h-6 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  </StockPanel>
);

// 오버뷰 mini 차트용. 상세 chart 탭 페이지는 ChartTabsSkeleton 사용.
export const ChartSkeleton = () => (
  <StockPanel variant="lavender" className="animate-pulse">
    <div className="mb-3 h-5 w-24 rounded bg-muted" />
    <div className="h-[210px] w-full rounded bg-muted sm:h-[340px]" />
  </StockPanel>
);

export const ChartTabsSkeleton = () => (
  <div className="h-[400px] w-full animate-pulse rounded-xl border bg-elevated sm:h-[498px]" />
);

type FinancialsSkeletonProps = { compact?: boolean };

// compact=true: 오버뷰 축약 6행 + amber panel. compact=false: 페이지 풀 14행 + wrapper 없음.
export const FinancialsSkeleton = ({ compact = false }: FinancialsSkeletonProps = {}) => {
  const rows = compact ? 6 : 14;
  const periodCols = compact ? 2 : 5;

  const inner = (
    <div className="animate-pulse">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div className="h-5 w-24 rounded bg-muted" />
        {compact && <div className="h-4 w-16 rounded bg-muted" />}
      </div>
      <div className="mb-3 flex justify-end">
        <div className="h-8 w-28 rounded bg-muted" />
      </div>
      <div className={`${compact ? "mb-2" : "mb-3"} h-3.5 w-40 rounded bg-muted`} />
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th
              className={`${compact ? "pb-1 pr-3" : "pb-2 pl-3 pr-3 sm:pl-4 sm:pr-4"} text-left`}
            >
              <div className="h-3.5 w-8 rounded bg-muted" />
            </th>
            {Array.from({ length: periodCols }).map((_, i) => (
              <th
                key={i}
                className={`${compact ? "pb-1 pl-3" : "pb-2 pl-3 sm:pl-4"} text-right`}
              >
                <div className="ml-auto h-3.5 w-12 rounded bg-muted" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b last:border-0">
              <td
                className={`${compact ? "py-1.5 pr-3" : "py-2 pl-3 pr-3 sm:py-3 sm:pl-4 sm:pr-4"}`}
              >
                <div className="h-4 w-20 rounded bg-muted" />
              </td>
              {Array.from({ length: periodCols }).map((_, j) => (
                <td
                  key={j}
                  className={`${compact ? "py-1.5 pl-3" : "py-2 pl-3 sm:py-3 sm:pl-4"}`}
                >
                  <div className="ml-auto h-4 w-14 rounded bg-muted" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return compact ? <StockPanel variant="amber">{inner}</StockPanel> : inner;
};

export const DisclosuresSkeleton = () => (
  <StockPanel variant="sky" className="animate-pulse">
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="h-5 w-20 rounded bg-muted" />
      <div className="h-4 w-16 rounded bg-muted" />
    </div>
    <ul>
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="-mx-6 border-b border-sky-border px-6 py-2 last:border-0"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-4 w-16 shrink-0 rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  </StockPanel>
);

export const PriceStatsSkeleton = () => (
  <StockPanel variant="sage" className="animate-pulse">
    <div className="mb-3 h-5 w-20 rounded bg-muted" />
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <div className="h-3.5 w-16 rounded bg-muted" />
          <div className="h-6 w-24 rounded bg-muted" />
        </div>
        <div className="space-y-1.5">
          <div className="py-1.5">
            <div className="h-1.5 rounded-full bg-sage-border" />
          </div>
          <div className="flex justify-between">
            <div className="h-3.5 w-16 rounded bg-muted" />
            <div className="h-3.5 w-16 rounded bg-muted" />
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 h-3.5 w-20 rounded bg-muted" />
        <div className="grid grid-cols-3 gap-2 text-center">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="mx-auto h-3.5 w-8 rounded bg-muted" />
              <div className="mx-auto h-5 w-14 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </StockPanel>
);
