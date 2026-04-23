"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SearchInput } from "@/features/search/SearchInput";
import { WatchlistPreview } from "@/features/watchlist/WatchlistPreview";
import { ServiceValue } from "@/entities/home/ServiceValue";

const HomePage = () => {
  const router = useRouter();
  const [ticker, setTicker] = useState("");

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

      <WatchlistPreview />
      <ServiceValue />
    </main>
  );
};

export default HomePage;
