import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./Providers";
import { Navbar } from "@/components/layout/Navbar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { ScrollToTopButton } from "@/components/layout/ScrollToTopButton";
import { RecentVisitedBar } from "@/components/layout/RecentVisitedBar";
import { Footer } from "@/components/layout/Footer";
import { IosInputZoomFix } from "@/shared/components/IosInputZoomFix";
import { WatchlistSync } from "@/features/watchlist/WatchlistSync";
import { MemoSync } from "@/features/memo/MemoSync";
import { getBaseUrl } from "@/lib/base-url";
import { getMarketCalendar } from "@/lib/market-calendar";
import { notoSansKr } from "@/shared/fonts";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: {
    template: "%s | SlateKR",
    default: "SlateKR",
  },
  description: "국내 상장 종목의 가격·재무·공시 정보를 손쉽게 조회하세요",
  // "./" 는 요청 경로 기준으로 풀린다 — 하위 페이지마다 선언하지 않아도 각자 자기 URL 을 갖는다.
  alternates: { canonical: "./" },
  // title·description 을 비워 두면 Next 가 페이지의 title·description 으로 채운다.
  // og 이미지는 opengraph-image.png 파일 컨벤션.
  openGraph: { type: "website", url: "./" },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const calendar = await getMarketCalendar();
  return (
    <html lang="ko" suppressHydrationWarning className={notoSansKr.variable}>
      <body className="flex min-h-screen flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] font-sans antialiased md:pb-0">
        <Providers calendar={calendar}>
          <IosInputZoomFix />
          <WatchlistSync />
          <MemoSync />
          <Navbar />
          <RecentVisitedBar />
          <div className="flex-1">{children}</div>
          <Footer />
          <ScrollToTopButton />
          <BottomTabBar />
        </Providers>
      </body>
    </html>
  );
}
