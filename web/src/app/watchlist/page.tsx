import type { Metadata } from "next";
import { WatchlistPageClient } from "@/features/watchlist/WatchlistPageClient";

export const metadata: Metadata = {
  title: "관심종목",
  description: "관심종목을 그룹별로 저장하고 최근 조회 종목·메모와 함께 조회합니다.",
};

export default function WatchlistPage() {
  return <WatchlistPageClient />;
}
