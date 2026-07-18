"use client";

import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TtmEpsSource } from "@/lib/financials";

type PerCase = {
  source: TtmEpsSource;
  label: string;
};

const PER_CASES: PerCase[] = [
  { source: "ttm", label: "최근 4분기 합" },
  { source: "ttm_negative", label: "최근 4분기 합이 음수 → 표시 안 함" },
  { source: "annualized", label: "상장 1년 미만 → 연환산" },
  { source: "annual_fallback", label: "분기 결측 → 연간 EPS" },
  { source: "none", label: "데이터 없음 → 표시 안 함" },
];

type StockMetricsFormulaTooltipProps = {
  source: TtmEpsSource;
};

export const StockMetricsFormulaTooltip = ({ source }: StockMetricsFormulaTooltipProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label="지표 산식 안내"
        className="inline-flex cursor-help items-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
      >
        <HelpCircle className="size-4" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="left" className="max-w-xs px-3 py-2 text-left">
      <div className="space-y-2">
        <section>
          <p className="mb-1 font-semibold">PER = 현재가 ÷ EPS</p>
          <ul className="space-y-0.5 pl-2">
            {PER_CASES.map((c) => {
              const applied = c.source === source;
              return (
                <li
                  key={c.source}
                  className={
                    applied
                      ? "flex items-center gap-1.5 font-bold text-red-300"
                      : "flex items-center gap-1.5"
                  }
                >
                  <span>· {c.label}</span>
                  {applied && (
                    <span aria-label="적용된 산식" className="shrink-0">
                      ◀ 적용
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="space-y-0.5">
          <p>
            <span className="font-semibold">PBR</span> = 현재가 ÷ BPS
          </p>
          <p>
            <span className="font-semibold">EPS</span> = 최근 4분기 기본주당이익(보통주,
            IFRS) 합
          </p>
          <p>
            <span className="font-semibold">BPS</span> = 지배주주지분 ÷ 발행주식총수
            (자기주식 미차감)
          </p>
        </section>
        <section className="space-y-1 border-t border-primary-foreground/20 dark:border-white/15 pt-1.5 text-[11px] text-primary-foreground/80 dark:text-white/70">
          <p>붉은색으로 표시된 기준이 이 종목에 적용된 산식입니다.</p>
          <p>
            분기 수가 부족한 종목은 보유 분기를 연 단위로 환산하며, 실제 연간 실적과
            차이가 있을 수 있습니다.
          </p>
          <p>
            출처: DART 공시. 우선주 보유 종목은 보통주 기준이라 타 서비스 표기와 차이가
            있을 수 있습니다.
          </p>
        </section>
      </div>
    </TooltipContent>
  </Tooltip>
);
