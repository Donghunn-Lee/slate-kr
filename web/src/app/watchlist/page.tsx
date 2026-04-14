"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWatchlistStore } from "@/features/watchlist/store/useWatchlistStore";

const WatchlistPage = () => {
  const items = useWatchlistStore((s) => s.items);
  const removeFromWatchlist = useWatchlistStore((s) => s.removeFromWatchlist);

  const sorted = [...items].sort((a, b) => b.addedAt - a.addedAt);

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">관심종목</h1>

      {sorted.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">관심종목이 없습니다</p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border">
          {sorted.map((item) => (
            <li key={item.ticker} className="flex items-center justify-between px-4 py-3">
              <Link
                href={`/stocks/${item.ticker}`}
                className="flex items-center gap-3 hover:underline"
              >
                <span className="font-medium">{item.name}</span>
                <span className="font-mono text-sm text-muted-foreground">{item.ticker}</span>
                <span className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  {item.market}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeFromWatchlist(item.ticker)}
                aria-label={`${item.name} 관심종목 해제`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

export default WatchlistPage;
