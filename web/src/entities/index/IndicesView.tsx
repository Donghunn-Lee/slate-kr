"use client";

import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { IndexCode } from "@/shared/constants/indices";
import { StockPanel } from "@/entities/stock/StockPanel";
import { IndexAccordion } from "./IndexAccordion";

type IndicesViewProps = {
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  initialSelected: IndexCode;
};

export const IndicesView = ({
  dailyByIndex,
  initialSelected,
}: IndicesViewProps) => (
  <>
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        지수
      </h1>
    </div>
    <StockPanel variant="lavender">
      <IndexAccordion
        dailyByIndex={dailyByIndex}
        initialSelected={initialSelected}
      />
    </StockPanel>
  </>
);
