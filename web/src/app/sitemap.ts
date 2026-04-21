import type { MetadataRoute } from "next";
import { getAllTickers } from "@/lib/stocks";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/watchlist`, changeFrequency: "weekly", priority: 0.5 },
  ];

  let stockRoutes: MetadataRoute.Sitemap = [];
  try {
    const tickers = await getAllTickers();
    stockRoutes = tickers.map((ticker) => ({
      url: `${base}/stocks/${ticker}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));
  } catch {
    // DB 오류 시 정적 경로만 반환
  }

  return [...staticRoutes, ...stockRoutes];
}
