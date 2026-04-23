"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { SearchInput } from "@/features/search/SearchInput";
import { useRecentSearchesStore } from "@/features/search/useRecentSearchesStore";
import { WatchlistPreview } from "@/features/watchlist/WatchlistPreview";
import { ServiceValue } from "@/entities/home/ServiceValue";

const HomePage = () => {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const recentSearches = useRecentSearchesStore((s) => s.items);
  const addRecent = useRecentSearchesStore((s) => s.add);
  const removeRecent = useRecentSearchesStore((s) => s.remove);

  const handleSelect = (t: string, name: string) => {
    addRecent(t, name);
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
          <SearchInput value={ticker} onChange={setTicker} onSelect={handleSelect} />
        </div>
        <div className="mt-3 flex min-h-[60px] flex-wrap content-start justify-center gap-2">
          {recentSearches.map((s) => (
            <span
              key={s.ticker}
              className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
            >
              <button
                onClick={() => router.push(`/stocks/${s.ticker}`)}
                className="transition-colors hover:text-foreground"
              >
                {s.name}
              </button>
              <button
                onClick={() => removeRecent(s.ticker)}
                aria-label={`${s.name} 최근 검색 삭제`}
                className="transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </section>

      <WatchlistPreview />
      <ServiceValue />
    </main>
  );
};

export default HomePage;
