import { Suspense } from "react";

import { HomeHero } from "@/entities/home/HomeHero";
import { ServiceValue } from "@/entities/home/ServiceValue";
import { IndexChartSection } from "@/entities/index/IndexChartSection";
import { IndexSlate } from "@/features/index-quotes/IndexSlate";
import { WatchlistPreview } from "@/features/watchlist/WatchlistPreview";

const ChartFallback = () => (
  <div className="h-[348px] rounded-xl border bg-elevated" />
);

const HomePage = () => (
  <main className="mx-auto w-full max-w-4xl px-4">
    <HomeHero />

    <IndexSlate />

    <section className="mb-8 space-y-4">
      <h2 className="text-[13px] font-medium text-muted-foreground">지수 차트</h2>
      <Suspense fallback={<ChartFallback />}>
        <IndexChartSection indexCode="KOSPI" />
      </Suspense>
      <Suspense fallback={<ChartFallback />}>
        <IndexChartSection indexCode="KOSDAQ" />
      </Suspense>
      <Suspense fallback={<ChartFallback />}>
        <IndexChartSection indexCode="KOSPI200" />
      </Suspense>
    </section>

    <WatchlistPreview />
    <ServiceValue />
  </main>
);

export default HomePage;
