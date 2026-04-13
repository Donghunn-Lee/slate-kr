"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SearchInput } from "@/features/search/SearchInput";

const HomePage = () => {
  const router = useRouter();
  const [ticker, setTicker] = useState("");

  const handleSubmit = () => {
    const trimmed = ticker.trim();
    if (!trimmed) return;
    router.push(`/stocks/${trimmed}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-16">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">SlateKR</h1>
          <p className="text-muted-foreground">
            국내 상장 종목의 가격·재무·공시 정보를 빠르게 조회하세요
          </p>
        </div>
        <SearchInput value={ticker} onChange={setTicker} onSubmit={handleSubmit} />
      </div>
    </main>
  );
};

export default HomePage;
