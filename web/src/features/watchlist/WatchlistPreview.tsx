"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { useWatchlistStore, type WatchlistItem } from "./store/useWatchlistStore";
import type { TickerPriceSummary } from "@/app/api/prices/route";

function formatClose(close: number) {
  return close.toLocaleString("ko-KR") + "원";
}

function formatChange(change: number, changePct: number) {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toLocaleString("ko-KR")} (${sign}${changePct.toFixed(2)}%)`;
}

export function WatchlistPreview() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const memberships = useWatchlistStore((s) => s.memberships);
  const stockMeta = useWatchlistStore((s) => s.stockMeta);

  const preview = useMemo<WatchlistItem[]>(() => {
    const latestByTicker = new Map<string, number>();
    for (const m of memberships) {
      const cur = latestByTicker.get(m.ticker);
      if (cur === undefined || m.addedAt > cur) latestByTicker.set(m.ticker, m.addedAt);
    }
    return Array.from(latestByTicker.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ticker, addedAt]) => {
        const meta = stockMeta[ticker];
        if (!meta) return null;
        return { ticker, name: meta.name, market: meta.market, addedAt };
      })
      .filter((x): x is WatchlistItem => x !== null);
  }, [memberships, stockMeta]);

  const tickersKey = preview.map((p) => p.ticker).join(",");

  const [prices, setPrices] = useState<Record<string, TickerPriceSummary>>({});
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (tickersKey.length === 0) return;
    fetch(`/api/prices?tickers=${tickersKey}`)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data: TickerPriceSummary[]) => {
        setPrices(Object.fromEntries(data.map((d) => [d.ticker, d])));
        setFetchError(false);
      })
      .catch(() => {
        setFetchError(true);
      });
  }, [tickersKey]);

  if (!mounted) return null;

  if (preview.length === 0) {
    return (
      <section>
        <StockPanel>
          <p className="text-sm text-muted-foreground">
            저장한 관심종목을 여기서 모아 볼 수 있어요
          </p>
          <Link
            href="/watchlist"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-70"
          >
            관심종목 둘러보기 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </StockPanel>
      </section>
    );
  }

  return (
    <section>
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
        {fetchError ? (
          <p className="text-sm text-muted-foreground">관심종목 데이터를 불러오지 못했습니다</p>
        ) : null}
        <ul className="divide-y divide-border/60">
          {preview.map((item, i) => {
            const p = prices[item.ticker];
            return (
              <li key={item.ticker}>
                <Link
                  href={`/stocks/${item.ticker}`}
                  className={`flex items-center justify-between transition-opacity hover:opacity-70 ${
                    i === 0 ? "pb-3" : i === preview.length - 1 ? "pt-3" : "py-3"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {item.ticker} · {item.market}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {p ? (
                      <>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatClose(p.close)}
                        </p>
                        {p.change !== null && p.changePct !== null && (
                          <p
                            className={`text-xs tabular-nums ${
                              p.change > 0
                                ? "text-price-up"
                                : p.change < 0
                                  ? "text-price-down"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {formatChange(p.change, p.changePct)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </StockPanel>
    </section>
  );
}
