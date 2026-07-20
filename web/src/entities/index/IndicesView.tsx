import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { DomesticIndexCode } from "@/shared/constants/indices";
import type { PriceStats } from "@/shared/types/stock";
import { IndexAccordion } from "./IndexAccordion";

type IndicesViewProps = {
  dailyByIndex: Record<DomesticIndexCode, IndexDailySnapshot[] | null>;
  statsByIndex: Record<DomesticIndexCode, PriceStats | null>;
  volumeByIndex: Record<DomesticIndexCode, number | null>;
  initialSelected: DomesticIndexCode;
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
