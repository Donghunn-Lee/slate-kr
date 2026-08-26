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
  // 홈 스택 모드(<md) 전용: 480px 이상에서 미국 4 / 기타 4 로 2단 그리드. 480 미만은 1단.
  // 데스크톱(md+) 우측 pane 은 폭이 좁아 1단 유지 — 프롭 미전달 시 기존 동작(단일 리스트).
  twoColumnStacked?: boolean;
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
// 스파크라인 없음 (텍스트만).
export const OverseasIndexList = ({
  snapshotsByCode,
  twoColumnStacked = false,
}: OverseasIndexListProps) => {
  const { data } = useOverseasIndexQuotes();

  const renderRow = (code: OverseasIndexCode) => {
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
          className="flex items-center justify-between gap-2 px-4 py-1.5 transition-colors hover:bg-lavender-bg/50 md:px-6 md:py-2"
        >
          <span className="min-w-0 flex-1 truncate text-body-sm font-medium">
            {meta.label}
          </span>
          {price !== null && change !== null && changeRate !== null ? (
            <div className="flex shrink-0 items-baseline gap-1.5 md:gap-2">
              <span
                className={cn(
                  "text-body-sm font-semibold tabular-nums",
                  PRICE_SIGN_CLASS[sign],
                )}
              >
                {formatIndexPrice(price)}
              </span>
              {/* 라벨(truncate) → 숫자블록(shrink-0) 순서로 폭 부족 시 라벨이 먼저 잘림.
                  <md 스택 리스트는 인라인(폭 우선), md+ 좁은 우측 pane 은 stacked(높이 우선). */}
              <PriceChange
                change={change}
                changeRate={changeRate}
                sign={sign}
                symbol="arrow"
                size="xs"
                fractionDigits={2}
                className="text-micro md:hidden"
              />
              <PriceChange
                change={change}
                changeRate={changeRate}
                sign={sign}
                symbol="arrow"
                size="xs"
                stacked
                fractionDigits={2}
                className="hidden text-micro md:inline-flex"
              />
            </div>
          ) : (
            <span className="text-caption text-muted-foreground">—</span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className={cn("flex flex-col", twoColumnStacked && "pb-2")}>
      <div
        className={cn(
          "flex items-baseline gap-1.5 px-4 pb-1 text-micro uppercase tracking-widest text-muted-foreground md:px-6",
          // 스택 인스턴스는 상단 국내 미니셀과 리듬 균형 위해 pt 축소.
          // 데스크톱 pane 은 좌측 IndexCell 상단 정렬 기준 유지.
          twoColumnStacked ? "pt-2" : "pt-3",
        )}
      >
        <span>해외</span>
      </div>
      {twoColumnStacked ? (
        // registry 순서(SPX·.DJI·COMP·NDX / NI225·HSI·SHCOMP·DAX) 그대로 분할.
        // <560: 세로 스택 — 두 ul 사이 divider 는 outer divide-y 로 연속성 확보.
        // ≥560: 2단 — outer divide-y 해제 + divide-x 로 컬럼 사이 세로 라인.
        <div className="grid grid-cols-1 divide-y divide-border/60 min-[560px]:grid-cols-2 min-[560px]:divide-x min-[560px]:divide-y-0">
          <ul className="divide-y divide-border/60">
            {OVERSEAS_INDEX_CODES.slice(0, 4).map(renderRow)}
          </ul>
          <ul className="divide-y divide-border/60">
            {OVERSEAS_INDEX_CODES.slice(4).map(renderRow)}
          </ul>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {OVERSEAS_INDEX_CODES.map(renderRow)}
        </ul>
      )}
    </div>
  );
};
