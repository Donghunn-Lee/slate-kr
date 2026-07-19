"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
// live > fallback(직전 거래일) > "—" 순으로 폴백. IndexSlate 규칙과 정합.
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
  const [selected, setSelected] = useState<IndexCode>(initialSelected);
  const { data, isLoading } = useIndexQuotes();

  // 아코디언 변경 = 지수 전환. `collapsible={false}` 라 빈 문자열은 오지 않는다.
  // URL 은 replaceState 로 갱신 — deep-link/새로고침 대응, back 스택 오염 없음.
  const handleValueChange = (next: string) => {
    if (next === "") return;
    const code = next as IndexCode;
    setSelected(code);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/stocks/indices?index=${code}`);
    }
  };

  return (
    <div className="space-y-2">
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
        value={selected}
        onValueChange={handleValueChange}
        collapsible={false}
      >
        {INDEX_CODES.map((code) => {
          const isOpen = selected === code;
          const prices = dailyByIndex[code];
          const cell = data?.quotes[CELL_KEY[code]];
          return (
            <AccordionItem key={code} value={code}>
              <AccordionTrigger className="px-1">
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
              <AccordionContent>
                {/* Radix Content 는 open 시에만 자식을 마운트하므로 lightweight-charts
                    가 항상 정상 폭에서 초기화된다. 추가 방어로 isOpen 조건도 걸어
                    데이터 미도착 상태에서의 마운트/언마운트를 제어. */}
                {isOpen && prices !== null && prices !== undefined ? (
                  <IndexChartDynamic indexCode={code} prices={prices} />
                ) : isOpen ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    차트 데이터를 불러오지 못했습니다
                  </p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};
