import { ChartSkeleton } from "@/entities/stock/Skeletons";

export default function Loading() {
  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <div className="h-9 w-24 animate-pulse rounded bg-muted" />
      <ChartSkeleton />
    </main>
  );
}
