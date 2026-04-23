"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SearchInput } from "@/features/search/SearchInput";
import { StockPanel } from "@/entities/stock/StockPanel";
import { ServiceValue } from "@/entities/home/ServiceValue";
import { useWatchlistStore } from "@/features/watchlist/store/useWatchlistStore";

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
      <section className="flex flex-col items-center pb-14 pt-20 text-center">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">SlateKR</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          국내 상장 종목의 가격·재무·공시 정보를 빠르게 조회하세요
        </p>
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
              {preview.map((item, i) => (
                <li key={item.ticker}>
                  <Link
                    href={`/stocks/${item.ticker}`}
                    className={`flex items-center justify-between transition-opacity hover:opacity-70 ${
                      i === 0 ? "pb-3" : i === preview.length - 1 ? "pt-3" : "py-3"
                    }`}
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

      <ServiceValue />
    </main>
  );
};

export default HomePage;
