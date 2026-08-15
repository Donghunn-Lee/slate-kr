"use client";

import Link from "next/link";
import { PriceChange } from "@/shared/components/PriceChange";
import {
  OVERSEAS_INDEX_CODES,
  getIndexMeta,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot, PriceSign } from "@/shared/types/quote";
import { cn } from "@/lib/utils";
import { useOverseasIndexQuotes } from "./useOverseasIndexQuotes";

type OverseasIndexListProps = {
  // SSR 로 채워지는 해외 EOD 스냅샷. live=null 일 때 fallback 원천.
  snapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>;
};

const PRICE_SIGN_CLASS: Record<PriceSign, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "",
};

const signOfChange = (change: number): PriceSign =>
  change > 0 ? "up" : change < 0 ? "down" : "flat";

// 소수 2자리 고정 — 정수 지수도 47,000.00 으로 표시해 자릿수 흔들림 없이 열 정렬.
const formatIndexPrice = (v: number): string =>
  v.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// 해외 지수 리스트 — 8행. useOverseasIndexQuotes 라이브 우선, null 이면 SSR EOD fallback.
// 스파크라인 없음 (텍스트만). 지연 라벨은 헤더에 1개.
export const OverseasIndexList = ({
  snapshotsByCode,
}: OverseasIndexListProps) => {
  const { data } = useOverseasIndexQuotes();

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1.5 px-4 pt-3 pb-1 text-micro uppercase tracking-widest text-muted-foreground sm:px-6">
        <span>해외</span>
        <span>· 최대 15분 지연</span>
      </div>
      <ul className="divide-y divide-border/60">
        {OVERSEAS_INDEX_CODES.map((code) => {
          const meta = getIndexMeta(code);
          const live = data?.quotes[code] ?? null;
          const fallback = snapshotsByCode[code];

          // live 우선. live 없으면 fallback (EOD close). 둘 다 없으면 "—".
          const price = live?.price ?? fallback?.close ?? null;
          const change = live?.change ?? fallback?.change ?? null;
          const changeRate = live?.changeRate ?? fallback?.changeRate ?? null;
          const sign: PriceSign =
            live?.sign ??
            (fallback ? signOfChange(fallback.change) : "flat");

          return (
            <li key={code}>
              <Link
                href={`/stocks/indices?index=${encodeURIComponent(code)}`}
                className="flex items-center justify-between gap-2 px-4 py-1.5 transition-colors hover:bg-lavender-bg/50 sm:px-6 sm:py-2"
              >
                <span className="min-w-0 flex-1 truncate text-body-sm font-medium">
                  {meta.label}
                </span>
                {price !== null && change !== null && changeRate !== null ? (
                  <div className="flex shrink-0 items-baseline gap-1.5 sm:gap-2">
                    <span
                      className={cn(
                        "text-body-sm font-semibold tabular-nums",
                        PRICE_SIGN_CLASS[sign],
                      )}
                    >
                      {formatIndexPrice(price)}
                    </span>
                    {/* 라벨(truncate) → 숫자블록(shrink-0) 순서로 폭 부족 시 라벨이 먼저 잘림. */}
                    <PriceChange
                      change={change}
                      changeRate={changeRate}
                      sign={sign}
                      symbol="arrow"
                      size="xs"
                      fractionDigits={2}
                      className="text-micro sm:hidden"
                    />
                    <PriceChange
                      change={change}
                      changeRate={changeRate}
                      sign={sign}
                      symbol="arrow"
                      size="xs"
                      stacked
                      fractionDigits={2}
                      className="hidden text-micro sm:inline-flex"
                    />
                  </div>
                ) : (
                  <span className="text-caption text-muted-foreground">—</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
