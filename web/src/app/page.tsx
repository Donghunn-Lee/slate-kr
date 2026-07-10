import { HomeHero } from "@/entities/home/HomeHero";
import { ServiceValue } from "@/entities/home/ServiceValue";
import { IndexSlate } from "@/features/index-quotes/IndexSlate";
import { MarketRankingSlate } from "@/features/market-ranking/MarketRankingSlate";
import { WatchlistPreview } from "@/features/watchlist/WatchlistPreview";

const HomePage = () => (
  <main className="mx-auto w-full max-w-4xl space-y-8 px-4 pb-12">
    <HomeHero />
    <IndexSlate />
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
      <MarketRankingSlate />
      <WatchlistPreview />
    </div>
    <ServiceValue />
  </main>
);

export default HomePage;
