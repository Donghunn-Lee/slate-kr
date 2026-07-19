"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { INDEX_CODES, INDEX_LABEL, type IndexCode } from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import { useIndexQuotes, type IndexCellData } from "@/features/index-quotes/useIndexQuotes";
import { IndexChartDynamic } from "./IndexChartDynamic";

type IndexAccordionProps = {
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  initialSelected: IndexCode;
};

// useIndexQuotes 응답 키 매핑 — IndexChart 의 CELL_KEY 와 동일 축.
const CELL_KEY: Record<IndexCode, "kospi" | "kosdaq" | "kospi200"> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  KOSPI200: "kospi200",
};

const MarketStatus = ({
  marketOpen,
  date,
}: {
  marketOpen: boolean;
  date?: string;
}) =>
  marketOpen ? (
    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
      실시간
    </div>
  ) : (
    <div className="text-[13px] text-muted-foreground">
      15:30 장 마감{date ? ` · 기준일 ${date}` : ""}
    </div>
  );

type SummaryRowProps = {
  label: string;
  cell: IndexCellData | undefined;
};

// 요약행: 지수명 + 현재가 + 등락률. (KIS index quote 응답에 거래량 필드 없음 — 다음 단계.)
// live > fallback(직전 거래일) > "데이터 없음" 순으로 폴백. IndexSlate 규칙과 정합.
const SummaryRow = ({ label, cell }: SummaryRowProps) => {
  if (cell?.live) {
    const { live } = cell;
    return (
      <div className="flex flex-1 items-center justify-between gap-4">
        <span className="text-base font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tabular-nums">
            <PriceCountUp from={live.price} to={live.price} />
          </span>
          <PriceChange
            change={live.change}
            changeRate={live.changeRate}
            sign={live.sign}
            symbol="arrow"
            size="sm"
          />
        </div>
      </div>
    );
  }
  if (cell?.fallback) {
    const { fallback } = cell;
    return (
      <div className="flex flex-1 items-center justify-between gap-4">
        <span className="text-base font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tabular-nums">
            {fallback.close.toLocaleString("ko-KR")}
          </span>
          <span className="text-[11px] text-muted-foreground">직전 거래일</span>
          <PriceChange
            change={fallback.change}
            changeRate={fallback.changeRate}
            symbol="arrow"
            size="sm"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-between gap-4">
      <span className="text-base font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">데이터 없음</span>
    </div>
  );
};

export const IndexAccordion = ({
  dailyByIndex,
  initialSelected,
}: IndexAccordionProps) => {
  const { data, isLoading } = useIndexQuotes();

  // collapsible → 열린 지수 클릭 시 닫힘. next==="" 은 전부 닫힘 상태.
  // URL 은 열림 지수만 반영, 닫힘 시 ?index= 제거.
  const handleValueChange = (next: string) => {
    if (typeof window === "undefined") return;
    const url = next === "" ? "/stocks/indices" : `/stocks/indices?index=${next}`;
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end px-1">
        {data ? (
          <MarketStatus
            marketOpen={data.marketOpen}
            date={data.quotes.kospi.fallback?.date}
          />
        ) : null}
      </div>
      <Accordion
        type="single"
        defaultValue={initialSelected}
        onValueChange={handleValueChange}
        collapsible
        className="space-y-4"
      >
        {INDEX_CODES.map((code) => {
          const prices = dailyByIndex[code];
          const cell = data?.quotes[CELL_KEY[code]];
          return (
            <AccordionItem key={code} value={code} className="border-b-0">
              <StockPanel variant="lavender" className="p-0">
                <AccordionTrigger className="px-6 py-4">
                  {isLoading && !cell ? (
                    <div className="flex flex-1 items-center justify-between gap-4">
                      <span className="text-base font-medium">
                        {INDEX_LABEL[code]}
                      </span>
                      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                    </div>
                  ) : (
                    <SummaryRow label={INDEX_LABEL[code]} cell={cell} />
                  )}
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  {/* Radix Content 는 open 시에만 자식을 마운트하고 width 는 애니메이션 중
                      유지되므로 (height 만 keyframes 로 animate + overflow hidden),
                      height=450 고정 차트는 0폭 초기화 문제가 없다. */}
                  {prices !== null && prices !== undefined ? (
                    <IndexChartDynamic indexCode={code} prices={prices} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      차트 데이터를 불러오지 못했습니다
                    </p>
                  )}
                </AccordionContent>
              </StockPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};
