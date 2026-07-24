"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PriceChange } from "@/shared/components/PriceChange";
import { formatMarketCap } from "@/shared/format";
import type { LatestPriceSummary } from "@/lib/prices";
import type { PriceSign } from "@/shared/types/quote";
import type { StockSearchResult } from "@/shared/types/stock";
import { useMultiQuote } from "@/features/multi-quote/useMultiQuote";
import { cn } from "@/lib/utils";

// RankingRow 의 헤더/행 동기화 패턴 차용. 컬럼 수는 검색 도메인(rank·kind 없음)
// 에 맞춰 재조정. 브레이크포인트는 프로젝트 관례(sm~md 는 데스크톱 갈림 sm 부터).
const GRID_CLASS = cn(
  "grid items-center gap-3 overflow-hidden sm:gap-2",
  "grid-cols-[minmax(0,1fr)_4.5rem_3.5rem]",
  "sm:grid-cols-[minmax(0,1fr)_4.5rem_9rem_4.5rem_5rem]",
  "md:grid-cols-[minmax(0,1fr)_3.5rem_5rem_9rem_4.5rem_5rem]"
);

const SIGN_TEXT_CLASS: Record<PriceSign, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "text-muted-foreground",
};

const resolveSign = (change: number | null): PriceSign => {
  if (change === null || change === 0) return "flat";
  return change > 0 ? "up" : "down";
};

const percentText = (pct: number | null, sign: PriceSign): string => {
  if (pct === null) return "—";
  const prefix = sign === "flat" ? "" : pct > 0 ? "+" : "";
  return `${prefix}${pct.toFixed(2)}%`;
};

// RankingRow.compactShares 와 동일 규칙 — 축약 단위(만주/억주)로 데스크톱 폭 절약.
const compactShares = (n: number): string => {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억주";
  if (n >= 10_000)
    return Math.round(n / 10_000).toLocaleString("ko-KR") + "만주";
  return n.toLocaleString("ko-KR") + "주";
};

const SearchResultHeader = () => (
  <div
    className={cn(
      GRID_CLASS,
      "border-b border-subtle whitespace-nowrap px-2 pb-2 pt-1 text-[10px] font-medium text-muted-foreground sm:text-[11px]"
    )}
  >
    <span>종목</span>
    <span className="hidden md:block">시장</span>
    <span className="justify-self-end">현재가</span>
    <span className="justify-self-end sm:hidden">등락률</span>
    <span className="hidden justify-self-end sm:block">등락</span>
    <span className="hidden justify-self-end sm:block">거래량</span>
    <span className="hidden justify-self-end sm:block">거래대금</span>
  </div>
);

type SearchResultRowProps = {
  stock: StockSearchResult;
  price: LatestPriceSummary | undefined;
  liveClose: number | null;
  liveChange: number | null;
  liveChangeRate: number | null;
  liveSign: PriceSign | undefined;
  liveVolume: number | null;
  isLiveFailed: boolean;
};

const SearchResultRow = ({
  stock,
  price,
  liveClose,
  liveChange,
  liveChangeRate,
  liveSign,
  liveVolume,
  isLiveFailed,
}: SearchResultRowProps) => {
  // 라이브 우선, 없으면 EOD 폴백. 둘 다 없으면 null → "—".
  const displayClose = liveClose ?? price?.close ?? null;
  const displayChange = liveChange ?? price?.change ?? null;
  const displayChangeRate = liveChangeRate ?? price?.changeRate ?? null;
  const displayVolume = liveVolume ?? price?.volume ?? null;
  const sign = liveSign ?? resolveSign(displayChange);
  // 거래대금 = close × volume 근사(일봉 관례). 소스 섞기 방지 위해 라이브·EOD 각각 계산 후 폴백.
  const liveTradeValue =
    liveClose !== null && liveVolume !== null ? liveClose * liveVolume : null;
  const eodTradeValue = price ? price.close * price.volume : null;
  const displayTradeValue = liveTradeValue ?? eodTradeValue;

  return (
    <li className="border-b border-subtle last:border-b-0">
      <Link
        href={`/stocks/${stock.ticker}`}
        aria-label={`${stock.name} 상세 보기`}
        className={cn(GRID_CLASS, "px-2 py-2.5 transition-colors hover:bg-muted/40")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{stock.name}</span>
          {isLiveFailed && (
            <span className="shrink-0 rounded-sm border border-subtle bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
              일시 지연
            </span>
          )}
        </div>
        <span className="hidden font-mono text-[11px] text-muted-foreground md:block">
          {stock.market}
        </span>
        <span className="justify-self-end text-sm font-bold tabular-nums text-foreground">
          {displayClose !== null ? displayClose.toLocaleString("ko-KR") : "—"}
          <span className="hidden md:inline">원</span>
        </span>
        <span
          className={cn(
            "justify-self-end text-xs font-medium tabular-nums sm:hidden",
            SIGN_TEXT_CLASS[sign]
          )}
        >
          {percentText(displayChangeRate, sign)}
        </span>
        <div className="hidden justify-self-end sm:block">
          {displayChange !== null && displayChangeRate !== null ? (
            <PriceChange
              change={displayChange}
              changeRate={displayChangeRate}
              sign={sign}
              symbol="sign"
              unit="원"
              size="xs"
              className="leading-none"
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
        <span className="hidden justify-self-end text-xs tabular-nums text-muted-foreground sm:block md:text-[11px]">
          {displayVolume !== null ? compactShares(displayVolume) : "—"}
        </span>
        <span className="hidden justify-self-end text-xs tabular-nums text-muted-foreground sm:block md:text-[11px]">
          {displayTradeValue !== null ? formatMarketCap(displayTradeValue) : "—"}
        </span>
      </Link>
    </li>
  );
};

type SearchResultListProps = {
  results: StockSearchResult[];
  basePrices: Record<string, LatestPriceSummary>;
};

export const SearchResultList = ({ results, basePrices }: SearchResultListProps) => {
  const tickers = useMemo(() => results.map((r) => r.ticker), [results]);
  const { quotes, failed } = useMultiQuote(tickers);

  return (
    <div>
      <SearchResultHeader />
      <ul>
        {results.map((stock) => {
          const q = quotes[stock.ticker] ?? null;
          return (
            <SearchResultRow
              key={stock.ticker}
              stock={stock}
              price={basePrices[stock.ticker]}
              liveClose={q ? q.price : null}
              liveChange={q ? q.change : null}
              liveChangeRate={q ? q.changeRate : null}
              liveSign={q ? q.sign : undefined}
              liveVolume={q ? q.volume : null}
              isLiveFailed={failed[stock.ticker] ?? false}
            />
          );
        })}
      </ul>
    </div>
  );
};
