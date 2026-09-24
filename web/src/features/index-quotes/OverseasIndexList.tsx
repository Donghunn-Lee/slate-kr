"use client";

import Link from "next/link";
import { PriceChange } from "@/shared/components/PriceChange";
import {
  OVERSEAS_INDEX_CODES,
  getIndexMeta,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot, PriceSign } from "@/shared/types/quote";
import { priceToneClass } from "@/shared/utils/priceTone";
import { cn } from "@/lib/utils";
import { useOverseasIndexQuotes } from "./useOverseasIndexQuotes";

type OverseasIndexListProps = {
  // SSR 로 채워지는 해외 EOD 스냅샷. live=null 일 때 fallback 원천.
  snapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>;
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
// 레이아웃은 뷰포트만으로 결정 — 홈 IndexSlate 단일 트리에 한 번 마운트된다.
// <md 스택: 560px 이상 미국 4 / 기타 4 2단, 미만 1단. md+ 우측 pane 은 폭이 좁아 1단.
export const OverseasIndexList = ({ snapshotsByCode }: OverseasIndexListProps) => {
  const { data, isPending } = useOverseasIndexQuotes();

  const renderRow = (code: OverseasIndexCode) => {
    const meta = getIndexMeta(code);
    const live = data?.quotes[code] ?? null;
    const fallback = snapshotsByCode[code];
    // EOD 폴백 캡션은 quote 응답 뒤에만 — 첫 응답 전 SSR 값에도 붙이면 로드마다 8행이 깜빡인다.
    // /indices Rail·Chip 과 같은 규칙.
    const showFallbackCaption = live === null && fallback !== null && !isPending;

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
            // 캡션은 숫자 행 아래 별도 줄 — 숫자 행에 같이 두면(flex-wrap 포함) 블록의 max-content
            // 폭에 캡션이 더해져 좁은 pane 에서 라벨(truncate)이 먼저 잘린다.
            <div className="flex shrink-0 flex-col items-end">
              <div className="flex items-baseline gap-1.5 md:gap-2">
                <span
                  className={cn(
                    "text-body-sm font-semibold tabular-nums",
                    priceToneClass(sign),
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
              {showFallbackCaption && (
                <span className="text-micro text-muted-foreground">직전 거래일</span>
              )}
            </div>
          ) : (
            <span className="text-caption text-muted-foreground">—</span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col pb-2 md:pb-0">
      {/* <md 스택은 상단 국내 셀과 리듬 균형 위해 pt 축소. md+ pane 은 좌측 IndexCell
          상단 정렬 기준 유지. */}
      <div className="flex items-baseline gap-1.5 px-4 pb-1 pt-2 text-micro uppercase tracking-widest text-muted-foreground md:px-6 md:pt-3">
        <span>해외</span>
      </div>
      {/* registry 순서(SPX·.DJI·COMP·NDX / NI225·HSI·SHCOMP·DAX) 그대로 분할.
          기본(<560 · md+): 세로 스택 — 두 ul 사이 divider 는 outer divide-y 로 연속성 확보.
          560~md: 2단 — outer divide-y 해제 + divide-x 로 컬럼 사이 세로 라인.
          max-md 로 감싸 md+ 에서 다시 1단으로 돌아가며, min-[560px] 과 md 의 CSS 순서에
          기대지 않는다. */}
      <div className="grid grid-cols-1 divide-y divide-border/60 max-md:min-[560px]:grid-cols-2 max-md:min-[560px]:divide-x max-md:min-[560px]:divide-y-0">
        <ul className="divide-y divide-border/60">
          {OVERSEAS_INDEX_CODES.slice(0, 4).map(renderRow)}
        </ul>
        <ul className="divide-y divide-border/60">
          {OVERSEAS_INDEX_CODES.slice(4).map(renderRow)}
        </ul>
      </div>
    </div>
  );
};
