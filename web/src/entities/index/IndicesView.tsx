import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { IndexCode } from "@/shared/constants/indices";
import type { PriceStats } from "@/shared/types/stock";
import { IndexAccordion } from "./IndexAccordion";

type IndicesViewProps = {
  dailyByIndex: Record<IndexCode, IndexDailySnapshot[] | null>;
  statsByIndex: Record<IndexCode, PriceStats | null>;
  volumeByIndex: Record<IndexCode, number | null>;
  initialSelected: IndexCode;
};

export const IndicesView = ({
  dailyByIndex,
  statsByIndex,
  volumeByIndex,
  initialSelected,
}: IndicesViewProps) => (
  <>
    <h1 className="text-lg font-semibold tracking-tight text-foreground">
      지수
    </h1>
    <IndexAccordion
      dailyByIndex={dailyByIndex}
      statsByIndex={statsByIndex}
      volumeByIndex={volumeByIndex}
      initialSelected={initialSelected}
    />
  </>
);
