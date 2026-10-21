import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/base-url";
import { getAllTickers } from "@/lib/stocks";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();
  // URL 별 갱신일은 추적하지 않는다 — 시세·공시가 거래일마다 바뀌므로 생성 시각 하나로 갈음.
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${base}/watchlist`, lastModified, changeFrequency: "weekly", priority: 0.5 },
  ];

  let stockRoutes: MetadataRoute.Sitemap = [];
  try {
    const tickers = await getAllTickers();
    stockRoutes = tickers.map((ticker) => ({
      url: `${base}/stocks/${ticker}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));
  } catch {
    // DB 오류 시 정적 경로만 반환
  }

  return [...staticRoutes, ...stockRoutes];
}
