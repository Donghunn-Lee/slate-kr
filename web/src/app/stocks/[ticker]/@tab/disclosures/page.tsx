import { Suspense } from "react";
import { StockDisclosures } from "@/entities/stock/StockDisclosures";
import { DisclosuresSkeleton } from "@/entities/stock/Skeletons";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function DisclosuresPage({ params }: PageProps) {
  const { ticker } = await params;
  return (
    <Suspense fallback={<DisclosuresSkeleton />}>
      <StockDisclosures ticker={ticker} />
    </Suspense>
  );
}
