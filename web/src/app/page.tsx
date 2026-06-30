import { HomeHero } from "@/entities/home/HomeHero";
import { ServiceValue } from "@/entities/home/ServiceValue";
import { IndexSlate } from "@/features/index-quotes/IndexSlate";
import { WatchlistPreview } from "@/features/watchlist/WatchlistPreview";

const HomePage = () => (
  <main className="mx-auto w-full max-w-4xl space-y-8 px-4 pb-12">
    <HomeHero />
    <IndexSlate />
    <WatchlistPreview />
    <ServiceValue />
  </main>
);

export default HomePage;
