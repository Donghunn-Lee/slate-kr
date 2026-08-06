import { ChartSkeleton } from "@/entities/stock/Skeletons";

export default function Loading() {
  return (
    <main className="container mx-auto max-w-6xl space-y-3 px-4 py-5 sm:space-y-4 sm:py-8">
      <div className="h-9 w-24 animate-pulse rounded bg-muted" />
      <ChartSkeleton />
    </main>
  );
}
