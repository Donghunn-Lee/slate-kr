import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./Providers";
import { Navbar } from "@/components/layout/Navbar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { ScrollToTopButton } from "@/components/layout/ScrollToTopButton";
import { RecentVisitedBar } from "@/components/layout/RecentVisitedBar";
import { Footer } from "@/components/layout/Footer";
import { DemoNotice } from "@/components/layout/DemoNotice";
import { IosInputZoomFix } from "@/shared/components/IosInputZoomFix";
import { WatchlistSync } from "@/features/watchlist/WatchlistSync";
import { MemoSync } from "@/features/memo/MemoSync";
import { getBaseUrl } from "@/lib/base-url";
import { getMarketCalendar } from "@/lib/market-calendar";
import { DEMO_NOTICE_SEEN_SCRIPT } from "@/shared/constants/demoNotice";
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
        {/* next/script 의 beforeInteractive 는 Next 런타임이 나중에 실행한다 — 첫 페인트 전에 돌아야 해 일반 script 로 둔다. */}
        <script dangerouslySetInnerHTML={{ __html: DEMO_NOTICE_SEEN_SCRIPT }} />
        <Providers calendar={calendar}>
          <IosInputZoomFix />
          <WatchlistSync />
          <MemoSync />
          <Navbar />
          {/* 카드는 fixed 라 DOM 순서가 화면 위치와 무관하다 — 앞쪽에 둬야 첫 페인트 전에 파싱된다. */}
          <DemoNotice />
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
