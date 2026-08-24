"use client";

import Link from "next/link";
import type { TickerDisclosureCount } from "@/app/api/disclosures/recent-count/route";
import { PriceChange } from "@/shared/components/PriceChange";
import { formatMarketCap } from "@/shared/format";
import type { PriceSign } from "@/shared/types/quote";
import type {
  MarketRankingItem,
  MarketRankingKind,
} from "@/shared/types/ranking";
import { cn } from "@/lib/utils";

// KIS prdy_vrss_sign(1상한/2상승/3보합/4하한/5하락) → PriceSign 정규화.
const toPriceSign = (code: string): PriceSign =>
  code === "3" ? "flat" : code === "1" || code === "2" ? "up" : "down";

const SIGN_TEXT_CLASS: Record<PriceSign, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "text-muted-foreground",
};

// PriceChange 내부 prefix 규칙과 동일 (수정 대신 소수 로직 재현).
const percentText = (pct: number, sign: PriceSign): string => {
  const prefix = sign === "flat" ? "" : pct > 0 ? "+" : "";
  return `${prefix}${pct.toFixed(2)}%`;
};

// 데스크톱은 억/만 suffix 유지, 모바일은 단위를 헤더 라벨(만/억) 로 흡수해 정수 콤마만.
const compactShares = (n: number): string => {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억주";
  if (n >= 10_000)
    return Math.round(n / 10_000).toLocaleString("ko-KR") + "만주";
  return n.toLocaleString("ko-KR") + "주";
};
const shareInWan = (n: number): string => {
  if (n < 10_000) return (n / 10_000).toFixed(1);
  return Math.round(n / 10_000).toLocaleString("ko-KR");
};
const valueInEok = (n: number): string =>
  Math.round(n / 100_000_000).toLocaleString("ko-KR");

const isValueMode = (kind: MarketRankingKind): boolean =>
  kind.kind === "volume" && kind.by === "value";

type VolumeText = { mobile: string; desktop: string };
const resolveVolumeTexts = (
  item: MarketRankingItem,
  kind: MarketRankingKind,
): VolumeText => {
  if (isValueMode(kind)) {
    if (item.tradeValue === undefined) return { mobile: "", desktop: "" };
    return {
      mobile: valueInEok(item.tradeValue),
      desktop: formatMarketCap(item.tradeValue),
    };
  }
  if (item.volume === undefined) return { mobile: "", desktop: "" };
  return {
    mobile: shareInWan(item.volume),
    desktop: compactShares(item.volume),
  };
};

type VolumeLabel = { mobile: string; desktop: string };
const volumeLabels = (kind: MarketRankingKind): VolumeLabel =>
  isValueMode(kind)
    ? { mobile: "거래대금(억)", desktop: "거래대금" }
    : { mobile: "거래량(만)", desktop: "거래량" };

// < sm(<640): 5컬럼 (순위/종목명/현재가/등락률/거래량) 최대 압축, text-xs.
// sm~md(640~767): 6컬럼 (+ 등락 풀·최근 공시). sm 구간 공백이 남던 문제 해소.
// md+(768+): 7컬럼 (+ 시장). 프로젝트 관례상 md가 데스크톱 갈림 지점.
// 헤더/행/스켈레톤이 반드시 같은 템플릿을 공유한다.
const GRID_CLASS = cn(
  "grid items-center gap-3 overflow-hidden sm:gap-2",
  "grid-cols-[1.25rem_minmax(0,1fr)_3.5rem_3.25rem_2.75rem]",
  "sm:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_9rem_4.5rem_3.5rem]",
  "md:grid-cols-[2rem_minmax(0,1fr)_4rem_5rem_9rem_4.5rem_4rem]",
);

type RankingHeaderProps = {
  kind: MarketRankingKind;
};

export const RankingHeader = ({ kind }: RankingHeaderProps) => {
  const labels = volumeLabels(kind);
  return (
    <div
      className={cn(
        GRID_CLASS,
        "-mx-4 whitespace-nowrap border-b border-subtle px-4 pb-2 pt-1 text-micro font-medium text-muted-foreground md:-mx-6 md:px-6",
      )}
    >
      <span className="justify-self-center">순위</span>
      <span>종목명</span>
      <span className="hidden md:block">시장</span>
      <span className="justify-self-end">현재가</span>
      <span className="justify-self-center sm:hidden">등락률</span>
      <span className="hidden justify-self-end sm:block">등락</span>
      <span className="justify-self-end">
        <span className="sm:hidden">{labels.mobile}</span>
        <span className="hidden sm:inline">{labels.desktop}</span>
      </span>
      <span className="hidden justify-self-end sm:block">최근 공시</span>
    </div>
  );
};

type RankingRowProps = {
  item: MarketRankingItem;
  disclosure?: TickerDisclosureCount;
  kind: MarketRankingKind;
};

export const RankingRow = ({ item, disclosure, kind }: RankingRowProps) => {
  const sign = toPriceSign(item.changeSign);
  const volTexts = resolveVolumeTexts(item, kind);
  const count = disclosure?.count ?? null;
  const disclosureText = count !== null && count > 0 ? `${count}건` : "";

  return (
    <li className="relative -mx-4 border-b border-subtle transition-colors last:border-b-0 hover:bg-muted/40 md:-mx-6">
      <Link
        href={`/stocks/${item.ticker}`}
        aria-label={`${item.name} 상세 보기`}
        className="absolute inset-0"
      />
      <div className={cn(GRID_CLASS, "px-4 py-1.5 sm:py-2 md:px-6")}>
        <span className="justify-self-center font-mono text-xs tabular-nums text-muted-foreground sm:text-sm">
          {item.rank}
        </span>
        <span className="min-w-0 truncate text-xs font-normal text-foreground sm:text-sm sm:font-semibold">
          {item.name}
        </span>
        <span className="hidden font-mono text-micro text-muted-foreground md:block">
          {item.market ?? ""}
        </span>
        <span className="justify-self-end text-xs font-medium tabular-nums text-foreground sm:text-sm sm:font-bold">
          {item.price.toLocaleString("ko-KR")}
          <span className="hidden md:inline">원</span>
        </span>
        <span
          className={cn(
            "justify-self-end text-xs font-medium tabular-nums sm:hidden",
            SIGN_TEXT_CLASS[sign],
          )}
        >
          {percentText(item.changePct, sign)}
        </span>
        <div className="hidden justify-self-end sm:block">
          <PriceChange
            change={item.change}
            changeRate={item.changePct}
            sign={sign}
            symbol="sign"
            unit="원"
            size="xs"
            className="leading-none"
          />
        </div>
        <span className="justify-self-end text-xs tabular-nums text-muted-foreground sm:text-sm md:text-[11px]">
          <span className="sm:hidden">{volTexts.mobile}</span>
          <span className="hidden sm:inline">{volTexts.desktop}</span>
        </span>
        <span className="hidden justify-self-end sm:block">
          {count !== null && count > 0 ? (
            <Link
              href={`/stocks/${item.ticker}/disclosures`}
              aria-label={`${item.name} 최근 공시 ${count}건 보기`}
              className="relative z-10 -my-1.5 inline-flex items-center rounded-sm py-1.5 text-caption tabular-nums text-amber-accent hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {disclosureText}
            </Link>
          ) : null}
        </span>
      </div>
    </li>
  );
};

export const RankingRowSkeleton = () => (
  <li className="-mx-4 border-b border-subtle last:border-b-0 md:-mx-6">
    <div className={cn(GRID_CLASS, "animate-pulse px-4 py-1.5 sm:py-2 md:px-6")}>
      <div className="mx-auto h-3 w-3 rounded bg-muted sm:h-3.5" />
      <div className="h-3.5 w-24 rounded bg-muted sm:h-4" />
      <div className="hidden h-3 w-10 rounded bg-muted md:block" />
      <div className="ml-auto h-3.5 w-12 rounded bg-muted sm:h-4 sm:w-16" />
      <div className="ml-auto h-3 w-12 rounded bg-muted sm:hidden" />
      <div className="ml-auto hidden h-3 w-28 rounded bg-muted sm:block" />
      <div className="ml-auto h-3 w-10 rounded bg-muted sm:h-3.5 sm:w-12" />
      <div className="ml-auto hidden h-3 w-8 rounded bg-muted sm:block" />
    </div>
  </li>
);
