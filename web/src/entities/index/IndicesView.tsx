"use client";

import { useState } from "react";
import Link from "next/link";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import {
  INDEX_CODES,
  INDEX_LABEL,
  type IndexCode,
} from "@/shared/constants/indices";
import { StockPanel } from "@/entities/stock/StockPanel";
import { IndexChartDynamic } from "./IndexChartDynamic";
import { cn } from "@/lib/utils";

type IndicesViewProps = {
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  initialSelected: IndexCode;
};

export const IndicesView = ({
  dailyByIndex,
  initialSelected,
}: IndicesViewProps) => {
  const [selected, setSelected] = useState<IndexCode>(initialSelected);
  const prices = dailyByIndex[selected];

  // 지수 전환은 client state 로만 처리 — 서버 재실행/Suspense fallback 없이 즉시 반영.
  // URL 은 replaceState 로 갱신 (deep-link/새로고침 대응, back 스택 오염 없음, 서버 재렌더 X).
  const selectIndex = (code: IndexCode) => {
    setSelected(code);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/stocks/indices?index=${code}`);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          지수
        </h1>
        <div className="flex gap-1" role="tablist" aria-label="지수 선택">
          {INDEX_CODES.map((code) => {
            const active = code === selected;
            return (
              // Link 유지 — 우클릭/⌘·Ctrl·Shift/middle-click 로 새 탭 열기 지원.
              // 평범한 클릭만 preventDefault 로 client state 경로.
              <Link
                key={code}
                href={`/stocks/indices?index=${code}`}
                role="tab"
                aria-selected={active}
                onClick={(e) => {
                  if (
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey ||
                    e.button !== 0
                  ) {
                    return;
                  }
                  e.preventDefault();
                  selectIndex(code);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {INDEX_LABEL[code]}
              </Link>
            );
          })}
        </div>
      </div>
      <StockPanel variant="lavender">
        {prices === null ? (
          <>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              {INDEX_LABEL[selected]}
            </h2>
            <p className="text-sm text-muted-foreground">
              차트 데이터를 불러오지 못했습니다
            </p>
          </>
        ) : (
          <IndexChartDynamic indexCode={selected} prices={prices} />
        )}
      </StockPanel>
    </>
  );
};
