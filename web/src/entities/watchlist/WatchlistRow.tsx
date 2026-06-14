"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import type { WatchlistItem } from "@/features/watchlist/store/useWatchlistStore";
import { cn } from "@/lib/utils";

type WatchlistRowProps = {
  item: WatchlistItem;
  price?: TickerPriceSummary;
  disclosure?: TickerDisclosureCount;
  onRemove?: () => void;
};

const changeColor = (n: number | null | undefined): string => {
  if (n == null) return "text-muted-foreground";
  if (n > 0) return "text-price-up";
  if (n < 0) return "text-price-down";
  return "text-muted-foreground";
};

const formatSigned = (n: number, fractionDigits = 0): string => {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("ko-KR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
};

export const WatchlistRow = ({ item, price, disclosure, onRemove }: WatchlistRowProps) => {
  const handleRemove = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.();
  };

  return (
    <li className="group relative -mx-6 bg-transparent px-6 transition-colors hover:bg-muted/40">
      <div className="border-b border-subtle py-3 group-last:border-b-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-base font-semibold text-foreground">{item.name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {item.ticker} · {item.market}
            </span>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              aria-label={`${item.name} 관심종목 해제`}
              className="relative z-10 -mr-2 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold tabular-nums text-foreground">
              {price ? `${price.close.toLocaleString("ko-KR")}원` : "—"}
            </span>
            {price && price.change != null && price.changePct != null && (
              <span className={cn("text-xs font-medium tabular-nums", changeColor(price.change))}>
                {formatSigned(price.change)}원 ({formatSigned(price.changePct, 2)}%)
              </span>
            )}
          </div>

          {price?.change7dPct != null && (
            <div className="flex items-baseline gap-1.5 text-xs">
              <span className="text-muted-foreground">7일</span>
              <span className={cn("font-medium tabular-nums", changeColor(price.change7dPct))}>
                {formatSigned(price.change7dPct, 2)}%
              </span>
            </div>
          )}

          {disclosure?.count != null && disclosure.count > 0 && (
            <div className="flex items-baseline gap-1.5 text-xs">
              <span className="text-muted-foreground">신규 공시</span>
              <span className="font-medium tabular-nums text-amber-accent">
                {disclosure.count}건
              </span>
            </div>
          )}
        </div>
      </div>

      <Link
        href={`/stocks/${item.ticker}`}
        aria-label={`${item.name} 상세 보기`}
        className="absolute inset-0"
      />
    </li>
  );
};

export const WatchlistRowSkeleton = () => (
  <li className="group -mx-6 animate-pulse px-6">
    <div className="border-b border-subtle py-3 group-last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="h-3 w-28 rounded bg-muted" />
        </div>
        <div className="h-7 w-7 shrink-0 rounded-md bg-muted" />
      </div>
      <div className="mt-1.5 flex items-baseline gap-4">
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
    </div>
  </li>
);
