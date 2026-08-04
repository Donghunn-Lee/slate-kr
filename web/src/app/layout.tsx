import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { RecentVisitedBar } from "@/components/layout/RecentVisitedBar";
import { Footer } from "@/components/layout/Footer";
import { IosInputZoomFix } from "@/shared/components/IosInputZoomFix";

const suit = localFont({
  src: "../../public/fonts/SUIT-Variable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"),
  title: {
    template: "%s | SlateKR",
    default: "SlateKR",
  },
  description: "국내 상장 종목의 가격·재무·공시 정보를 빠르게 조회하세요",
  openGraph: {
    title: "SlateKR",
    description: "국내 상장 종목의 가격·재무·공시 정보를 빠르게 조회하세요",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SlateKR",
    description: "국내 상장 종목의 가격·재무·공시 정보를 빠르게 조회하세요",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={suit.variable}>
      <body className="flex min-h-screen flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] font-sans antialiased md:pb-0">
        <Providers>
          <IosInputZoomFix />
          <Navbar />
          <RecentVisitedBar />
          <div className="flex-1">{children}</div>
          <Footer />
          <BottomTabBar />
        </Providers>
      </body>
    </html>
  );
}
