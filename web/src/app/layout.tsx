import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const suit = localFont({
  src: "../../public/fonts/SUIT-Variable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

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
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
