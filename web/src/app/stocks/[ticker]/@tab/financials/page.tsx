import { Suspense } from "react";
import { StockFinancials } from "@/entities/stock/StockFinancials";
import { FinancialsSkeleton } from "@/entities/stock/Skeletons";

export const revalidate = 43200;

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function FinancialsPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <Suspense fallback={<FinancialsSkeleton />}>
      <StockFinancials ticker={ticker} />
    </Suspense>
  );
}
