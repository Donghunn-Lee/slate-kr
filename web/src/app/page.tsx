"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TrendingUp, BarChart2, FileText, ArrowRight } from "lucide-react";

import { SearchInput } from "@/features/search/SearchInput";
import { StockPanel } from "@/entities/stock/StockPanel";
import { useWatchlistStore } from "@/features/watchlist/store/useWatchlistStore";

const FEATURE_CARDS = [
  {
    icon: TrendingUp,
    title: "가격 흐름",
    description: "1년 OHLCV 차트와 현재가·등락·거래량·시가총액",
    variant: "chart" as const,
  },
  {
    icon: BarChart2,
    title: "핵심 재무 지표",
    description: "PER·PBR·EPS를 현재가 기준으로 실시간 계산",
    variant: "financials" as const,
  },
  {
    icon: FileText,
    title: "공시 분류",
    description: "최근 공시를 주요사항·재무·자본 등으로 분류해 태그 표시",
    variant: "disclosures" as const,
  },
];

const HomePage = () => {
  const router = useRouter();
  const [ticker, setTicker] = useState("");

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const items = useWatchlistStore((s) => s.items);
  const preview = [...items].sort((a, b) => b.addedAt - a.addedAt).slice(0, 3);

  const handleSubmit = () => {
    const trimmed = ticker.trim();
    if (!trimmed) return;
    router.push(`/stocks/${trimmed}`);
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4">
      {/* Hero */}
      <section className="flex flex-col items-center pb-12 pt-16 text-center">
        <div className="mb-6 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">SlateKR</h1>
          <p className="text-muted-foreground">
            국내 상장 종목의 가격·재무·공시 정보를 빠르게 조회하세요
          </p>
        </div>
        <div className="w-full">
          <SearchInput value={ticker} onChange={setTicker} onSubmit={handleSubmit} />
        </div>
      </section>

      {/* Watchlist preview */}
      {mounted && preview.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">내 관심종목</h2>
            <Link
              href="/watchlist"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              전체 보기 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <StockPanel>
            <ul className="divide-y divide-border/60">
              {preview.map((item) => (
                <li key={item.ticker}>
                  <Link
                    href={`/stocks/${item.ticker}`}
                    className="flex items-center justify-between py-3 transition-opacity hover:opacity-70 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {item.ticker} · {item.market}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">—</div>
                  </Link>
                </li>
              ))}
            </ul>
          </StockPanel>
        </section>
      )}

      {/* Feature overview */}
      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold">무엇을 확인할 수 있나요</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FEATURE_CARDS.map(({ icon: Icon, title, description, variant }) => (
            <StockPanel key={title} variant={variant} className="space-y-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </StockPanel>
          ))}
        </div>
      </section>
    </main>
  );
};

export default HomePage;
