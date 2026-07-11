"use client";

import Link from "next/link";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import { PriceChange } from "@/shared/components/PriceChange";
import { formatMarketCap } from "@/shared/format";
import type { PriceSign } from "@/shared/types/quote";
import type { MarketRankingItem } from "@/shared/types/ranking";

type RankingRowProps = {
  item: MarketRankingItem;
  disclosure?: TickerDisclosureCount;
};

// KIS prdy_vrss_sign(1상한/2상승/3보합/4하한/5하락) → PriceSign 정규화.
const toPriceSign = (code: string): PriceSign =>
  code === "3" ? "flat" : code === "1" || code === "2" ? "up" : "down";

// 거래량(주) 압축. 억/만 단위.
const compactShares = (n: number): string => {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억주";
  if (n >= 10_000)
    return Math.round(n / 10_000).toLocaleString("ko-KR") + "만주";
  return n.toLocaleString("ko-KR") + "주";
};

// 거래량 컬럼 문자열: volume-rank/value 응답이면 거래대금, 그 외에는 누적 거래량.
// 값이 없으면 빈 문자열 — 컬럼 자리는 유지해 하단 우측 3열 정렬이 흔들리지 않게.
const resolveSecondary = (item: MarketRankingItem): string => {
  if (item.tradeValue !== undefined) return formatMarketCap(item.tradeValue);
  if (item.volume !== undefined) return compactShares(item.volume);
  return "";
};

export const RankingRow = ({ item, disclosure }: RankingRowProps) => {
  const secondary = resolveSecondary(item);
  const showDisclosure =
    disclosure?.count != null && disclosure.count > 0;

  return (
    <li className="group relative -mx-6 bg-transparent px-6 transition-colors hover:bg-muted/40">
      <div className="flex items-stretch gap-3 border-b border-subtle pb-2 pt-1.5 group-last:border-b-0">
        <span className="flex w-7 shrink-0 items-center justify-center font-mono text-sm tabular-nums text-muted-foreground">
          {item.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 items-center gap-2">
            <span className="shrink-0 font-mono text-[11px] leading-none text-muted-foreground">
              {item.ticker}
              {item.market ? ` · ${item.market}` : ""}
            </span>
            {showDisclosure && (
              <div className="ml-auto flex items-center gap-1.5 text-[11px] leading-none">
                <span className="text-muted-foreground">신규 공시</span>
                <span className="font-medium tabular-nums text-amber-accent">
                  {disclosure.count}건
                </span>
              </div>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {item.name}
            </span>
            <div className="flex shrink-0 items-baseline gap-2">
              <span className="w-24 text-right text-sm font-bold leading-none tabular-nums text-foreground">
                {item.price.toLocaleString("ko-KR")}원
              </span>
              <div className="w-36 text-right">
                <PriceChange
                  change={item.change}
                  changeRate={item.changePct}
                  sign={toPriceSign(item.changeSign)}
                  symbol="sign"
                  unit="원"
                  size="xs"
                  className="leading-none"
                />
              </div>
              <span className="hidden w-20 text-right font-mono text-[11px] leading-none tabular-nums text-muted-foreground sm:block">
                {secondary}
              </span>
            </div>
          </div>
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

export const RankingRowSkeleton = () => (
  <li className="group -mx-6 animate-pulse px-6">
    <div className="flex items-stretch gap-3 border-b border-subtle pb-2 pt-1.5 group-last:border-b-0">
      <div className="flex w-7 shrink-0 items-center justify-center">
        <div className="h-3.5 w-3 rounded bg-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-5 items-center gap-2">
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="flex shrink-0 items-end gap-2">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-3 w-36 rounded bg-muted" />
            <div className="hidden h-3 w-20 rounded bg-muted sm:block" />
          </div>
        </div>
      </div>
    </div>
  </li>
);
