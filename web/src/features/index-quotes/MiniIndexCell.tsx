"use client";

import type { ReactNode } from "react";
import { PriceChange } from "@/shared/components/PriceChange";
import { IndexSparkline } from "@/entities/index/IndexSparkline";
import { cn } from "@/lib/utils";
import type { IndexIntradaySnapshot, PriceSign } from "@/shared/types/quote";
import type { IndexCellData } from "./useIndexQuotes";

// 가격 span 등락색. flat 은 default foreground 유지 (색 없음) — 무채로 두어
// "값 색상은 상승/하락 유의 신호" 인 의미를 보존.
const PRICE_SIGN_CLASS: Record<PriceSign, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "",
};

const signOfChange = (change: number): PriceSign =>
  change > 0 ? "up" : change < 0 ? "down" : "flat";

type MiniIndexCellProps = {
  label: string;
  cell: IndexCellData | undefined;
  bars: IndexIntradaySnapshot[];
  intradayFailed: boolean;
  // 값 문자열 포맷 — 국내(KRW, 콤마)·해외(소숫점 2자리 등) 케이스별 주입.
  formatPrice: (v: number) => string;
  // 라이브 값 렌더 방식 — 국내는 카운트업 애니메이션 노드, 해외는 formatPrice 결과 텍스트.
  // undefined 이면 formatPrice(cell.live.price) 로 fallback.
  renderLiveValue?: (price: number) => ReactNode;
  className?: string;
};

// 이름 위, 값·등락 아래(2단 스택), 스파크라인 우측. 모바일에서는 반폭 셀에 맞춰
// sparkline min-w 를 낮추고 PriceChange 를 한 단계 축소해 한 줄 유지.
export const MiniIndexCell = ({
  label,
  cell,
  bars,
  intradayFailed,
  formatPrice,
  renderLiveValue,
  className,
}: MiniIndexCellProps) => (
  <div
    className={cn(
      "flex flex-1 items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3",
      className,
    )}
  >
    <div className="flex min-w-0 flex-col">
      <div className="text-body font-bold text-muted-foreground">{label}</div>
      {cell?.live ? (
        <div className="mt-0.5 flex flex-col items-start gap-0.5">
          <span
            className={cn(
              "text-value font-semibold tabular-nums",
              PRICE_SIGN_CLASS[cell.live.sign],
            )}
          >
            {renderLiveValue
              ? renderLiveValue(cell.live.price)
              : formatPrice(cell.live.price)}
          </span>
          <PriceChange
            change={cell.live.change}
            changeRate={cell.live.changeRate}
            sign={cell.live.sign}
            symbol="arrow"
            size="xs"
            stacked
            className="text-micro sm:text-caption"
          />
        </div>
      ) : cell?.fallback ? (
        <div className="mt-0.5 flex flex-col items-start gap-0.5">
          <span
            className={cn(
              "text-value font-semibold tabular-nums",
              PRICE_SIGN_CLASS[signOfChange(cell.fallback.change)],
            )}
          >
            {formatPrice(cell.fallback.close)}
          </span>
          <PriceChange
            change={cell.fallback.change}
            changeRate={cell.fallback.changeRate}
            symbol="arrow"
            size="xs"
            stacked
            className="text-micro sm:text-caption"
          />
        </div>
      ) : (
        <div className="mt-0.5 text-body-sm text-muted-foreground">데이터 없음</div>
      )}
    </div>
    <div className="min-w-[50px] flex-1 sm:min-w-[110px]">
      <IndexSparkline bars={bars} failed={intradayFailed} />
    </div>
  </div>
);

// 스켈레톤 — 실 컴포넌트와 동일 padding/layout.
export const MiniIndexCellSkeleton = ({ label }: { label: string }) => (
  <div className="flex flex-1 items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
    <div className="flex flex-col">
      <div className="text-body font-bold text-muted-foreground">{label}</div>
      <div className="mt-1 h-5 w-20 animate-pulse rounded bg-muted" />
    </div>
    <div className="min-w-[50px] flex-1 sm:min-w-[110px]" aria-hidden />
  </div>
);
