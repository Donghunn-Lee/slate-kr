import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { IndexCode } from "@/shared/constants/indices";
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
    <h1 className="text-lg font-semibold tracking-tight text-foreground">
      지수
    </h1>
    <IndexAccordion
      dailyByIndex={dailyByIndex}
      initialSelected={initialSelected}
    />
  </>
);
