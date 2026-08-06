import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { IndexCode } from "@/shared/constants/indices";
import type { PriceStats } from "@/shared/types/stock";
import { IndexBoard } from "./IndexBoard";

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
    <h1 className="text-xl font-bold sm:text-2xl">지수</h1>
    <IndexBoard
      dailyByIndex={dailyByIndex}
      statsByIndex={statsByIndex}
      volumeByIndex={volumeByIndex}
      initialSelected={initialSelected}
    />
  </>
);
