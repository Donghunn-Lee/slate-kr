import { HomeHero } from "@/entities/home/HomeHero";
import { ServiceValue } from "@/entities/home/ServiceValue";
import { IndexSlate } from "@/features/index-quotes/IndexSlate";
import { WatchlistPreview } from "@/features/watchlist/WatchlistPreview";

const HomePage = () => (
  <main className="mx-auto w-full max-w-4xl px-4">
    <HomeHero />
    <IndexSlate />
    <WatchlistPreview />
    <ServiceValue />
  </main>
);

export default HomePage;
