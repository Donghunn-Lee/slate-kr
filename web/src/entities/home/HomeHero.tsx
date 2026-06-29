"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { SearchInput } from "@/features/search/SearchInput";
import { useRecentVisitedStore } from "@/features/search/useRecentVisitedStore";

export const HomeHero = () => {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const recentVisited = useRecentVisitedStore((s) => s.items).slice(0, 10);
  const removeRecent = useRecentVisitedStore((s) => s.remove);

  return (
    <section className="flex flex-col items-center pb-14 pt-16 text-center">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">SlateKR</h1>
      <p className="mb-10 text-sm text-muted-foreground">
        국내 상장 종목의 가격·재무·공시 정보를 빠르게 조회하세요
      </p>
      <div className="mx-auto w-full max-w-xl">
        <SearchInput value={ticker} onChange={setTicker} size="lg" />
      </div>
      {recentVisited.length > 0 && (
        <div className="mx-auto mt-6 w-full max-w-xl rounded-lg bg-muted/60 p-4 text-left">
          <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground/70">
            최근 조회
          </p>
          <div className="flex flex-wrap content-start gap-x-3 gap-y-1 text-xs">
            {recentVisited.map((s) => (
              <span key={s.ticker} className="flex items-center">
                <button
                  onClick={() => router.push(`/stocks/${s.ticker}`)}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  {s.name}
                </button>
                <button
                  onClick={() => removeRecent(s.ticker)}
                  aria-label={`${s.name} 최근 조회 삭제`}
                  className="cursor-pointer p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
