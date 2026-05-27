export const HeaderSkeleton = () => (
  <div className="animate-pulse space-y-3 rounded-xl border bg-elevated p-6">
    <div className="flex items-center gap-2">
      <div className="h-7 w-32 rounded bg-muted" />
      <div className="h-5 w-14 rounded bg-muted" />
      <div className="h-5 w-14 rounded bg-muted" />
    </div>
    <div className="h-10 w-40 rounded bg-muted" />
    <div className="h-5 w-48 rounded bg-muted" />
    <div className="h-4 w-32 rounded bg-muted" />
  </div>
);

export const MetricsSkeleton = () => (
  <div className="animate-pulse rounded-xl border bg-elevated p-6">
    <div className="mb-4 h-5 w-20 rounded bg-muted" />
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-10 rounded bg-muted" />
          <div className="h-6 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  </div>
);

export const ChartSkeleton = () => (
  <div className="animate-pulse rounded-xl border bg-elevated p-6">
    <div className="mb-4 h-5 w-16 rounded bg-muted" />
    <div className="h-[300px] w-full rounded bg-muted" />
  </div>
);

export const FinancialsSkeleton = () => (
  <div className="animate-pulse rounded-xl border bg-elevated p-6">
    <div className="mb-4 h-5 w-20 rounded bg-muted" />
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-5 w-12 rounded bg-muted" />
          <div className="h-5 flex-1 rounded bg-muted" />
          <div className="h-5 flex-1 rounded bg-muted" />
          <div className="h-5 flex-1 rounded bg-muted" />
        </div>
      ))}
    </div>
  </div>
);

export const DisclosuresSkeleton = () => (
  <div className="animate-pulse rounded-xl border bg-elevated p-6">
    <div className="mb-4 h-5 w-20 rounded bg-muted" />
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-5 w-3/4 rounded bg-muted" />
        </div>
      ))}
    </div>
  </div>
);
