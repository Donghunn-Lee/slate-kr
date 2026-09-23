import type { Metadata } from "next";
import { WatchlistPageClient } from "@/features/watchlist/WatchlistPageClient";

export const metadata: Metadata = {
  title: "관심종목",
};

export default function WatchlistPage() {
  return <WatchlistPageClient />;
}
