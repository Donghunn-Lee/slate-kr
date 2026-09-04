import type { Metadata } from "next";
import Link from "next/link";
import { StockPanel } from "@/entities/stock/StockPanel";

export const metadata: Metadata = {
  title: "데이터 출처·라이선스",
};

const DATA_SOURCES: ReadonlyArray<{ category: string; value: string }> = [
  { category: "시세", value: "한국투자증권 KIS OpenAPI" },
  { category: "지수 과거 데이터", value: "KRX Marketplace" },
  { category: "종목 정보", value: "공공데이터포털(금융위 KRX 상장종목 정보)" },
  { category: "공시·재무", value: "DART(금융감독원 전자공시시스템)" },
  { category: "AI 요약", value: "Google Gemini" },
];

export default function CreditsPage() {
  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-5 sm:space-y-8 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">데이터 출처·라이선스</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">데이터 출처</h2>
        <StockPanel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
            {DATA_SOURCES.map(({ category, value }) => (
              <div key={category} className="col-span-2 grid grid-cols-subgrid">
                <dt className="font-semibold whitespace-nowrap">{category}</dt>
                <dd className="wrap-anywhere break-keep">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-caption text-muted-foreground">
            장중 시세는 60초 간격으로 갱신됩니다.
          </p>
        </StockPanel>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">오픈소스 라이선스</h2>
        <StockPanel>
          <div className="space-y-3">
            <div>
              <h3 className="text-body font-semibold">TradingView Lightweight Charts™</h3>
              <p className="text-caption text-muted-foreground">Apache License 2.0</p>
            </div>
            <div className="rounded border border-subtle bg-elevated p-3 font-mono text-sm leading-relaxed">
              <p>TradingView Lightweight Charts™</p>
              <p>
                Copyright (с) 2025 TradingView, Inc.{" "}
                <Link
                  href="https://www.tradingview.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  https://www.tradingview.com/
                </Link>
              </p>
            </div>
            <p className="text-caption text-muted-foreground">
              라이선스 원문:{" "}
              <Link
                href="https://github.com/tradingview/lightweight-charts/blob/master/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                github.com/tradingview/lightweight-charts/LICENSE
              </Link>
            </p>
          </div>
        </StockPanel>
      </section>
    </main>
  );
}
