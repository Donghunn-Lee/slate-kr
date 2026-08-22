import {
  ChartSkeleton,
  DisclosuresSkeleton,
  FinancialsSkeleton,
  PriceStatsSkeleton,
} from "@/entities/stock/Skeletons";

// 오버뷰 page.tsx의 실제 헤더 텍스트와 4섹션 2열 그리드 구조를 그대로 반영해 CLS 최소화.
export default function Loading() {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <h2 className="text-sm font-semibold text-muted-foreground">종합정보</h2>
        <span className="text-xs font-normal text-muted-foreground/70">
          · 핵심 지표와 가격 정보를 한눈에
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartSkeleton />
        <FinancialsSkeleton compact />
        <DisclosuresSkeleton />
        <PriceStatsSkeleton />
      </div>
    </>
  );
}
