"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { TickerPriceSummary } from "@/app/api/prices/route";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import type { WatchlistItem } from "@/features/watchlist/store/useWatchlistStore";
import type { StockQuote } from "@/shared/types/quote";
import { PriceChange } from "@/shared/components/PriceChange";

type WatchlistRowProps = {
  item: WatchlistItem;
  price?: TickerPriceSummary;
  liveQuote?: StockQuote | null;
  // route catch/부분 실패 신호. true → EOD 값 유지 + "일시 지연" 배지.
  // stock-quote(#077) StockHeaderLivePrice 배지 문자·색 동형.
  isLiveFailed?: boolean;
  disclosure?: TickerDisclosureCount;
  onRemove?: () => void;
};

export const WatchlistRow = ({
  item,
  price,
  liveQuote,
  isLiveFailed = false,
  disclosure,
  onRemove,
}: WatchlistRowProps) => {
  const handleRemove = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.();
  };

  // 라이브 우선, 없으면 EOD 폴백.
  const live = liveQuote ?? null;
  const displayPrice = live !== null ? live.price : (price?.close ?? null);
  const displayChange = live !== null ? live.change : (price?.change ?? null);
  const displayChangeRate =
    live !== null ? live.changeRate : (price?.changePct ?? null);
  const displaySign = live !== null ? live.sign : undefined;

  return (
    <li className="group relative -mx-6 bg-transparent px-6 transition-colors hover:bg-muted/40">
      <Link
        href={`/stocks/${item.ticker}`}
        aria-label={`${item.name} 상세 보기`}
        className="absolute inset-0"
      />

      <div className="border-b border-subtle md:pb-3 md:pt-1 pb-1.5 pt-0.5 group-last:border-b-0">
        <div className="flex flex-col">
          <div className="flex min-h-7 items-center gap-2">
            <span className="shrink-0 font-mono text-[11px] leading-none text-muted-foreground md:text-xs">
              {item.ticker} · {item.market}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {isLiveFailed && (
                <span className="rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground">
                  일시 지연
                </span>
              )}
              {disclosure?.count != null && disclosure.count > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] leading-none md:text-xs">
                  <span className="text-muted-foreground">최근 공시</span>
                  <Link
                    href={`/stocks/${item.ticker}/disclosures`}
                    aria-label={`${item.name} 최근 공시 ${disclosure.count}건 보기`}
                    className="relative z-10 -my-1.5 inline-flex items-center rounded-sm py-1.5 font-medium tabular-nums text-amber-accent hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {disclosure.count}건
                  </Link>
                </div>
              )}
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
          </div>
          <div className="flex flex-row items-baseline justify-between gap-2 md:flex-col md:items-start md:justify-start md:gap-1">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground md:text-base">
              {item.name}
            </span>
            <div className="flex shrink-0 items-end gap-2">
              <span className="text-sm font-bold tabular-nums leading-none text-foreground md:text-base">
                {displayPrice !== null ? `${displayPrice.toLocaleString("ko-KR")}원` : "—"}
              </span>
              {displayChange !== null && displayChangeRate !== null && (
                <PriceChange
                  change={displayChange}
                  changeRate={displayChangeRate}
                  sign={displaySign}
                  symbol="sign"
                  unit="원"
                  size="xs"
                  className="leading-none"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};

export const WatchlistRowSkeleton = () => (
  <li className="group -mx-6 animate-pulse px-6">
    <div className="border-b border-subtle pb-1.5 pt-0.5 group-last:border-b-0 md:pb-3 md:pt-1">
      <div className="flex flex-col">
        <div className="flex min-h-7 items-center gap-2">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="ml-auto h-7 w-7 shrink-0 rounded-md bg-muted" />
        </div>
        <div className="flex flex-row items-baseline justify-between gap-2 md:flex-col md:items-start md:justify-start md:gap-1">
          <div className="h-4 w-32 rounded bg-muted md:h-5" />
          <div className="flex shrink-0 items-end gap-2">
            <div className="h-4 w-20 rounded bg-muted md:h-5" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  </li>
);
