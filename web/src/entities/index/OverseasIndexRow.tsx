import { PriceChange } from "@/shared/components/PriceChange";
import {
  OVERSEAS_INDEX_CODES,
  getIndexMeta,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import type { IndexDailySnapshot } from "@/shared/types/quote";

type OverseasIndexRowProps = {
  snapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>;
};

const formatIndexPrice = (v: number): string =>
  v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

// 최신 base_date 라벨은 성공한 스냅샷 중 가장 큰 것으로 도출. 3지수 모두 같은 collector 라
// 보통 동일하지만, 부분 실패가 나올 수 있으니 max 로 안전 처리.
const pickLatestDate = (
  snapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>,
): string | null => {
  const dates = OVERSEAS_INDEX_CODES.map((code) => snapshotsByCode[code]?.date).filter(
    (d): d is string => typeof d === "string",
  );
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
};

type OverseasCellProps = {
  label: string;
  snapshot: IndexDailySnapshot | null;
};

const OverseasCell = ({ label, snapshot }: OverseasCellProps) => (
  <div className="flex flex-1 flex-col justify-center px-6 py-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    {snapshot ? (
      <div className="mt-0.5 flex flex-col items-start gap-0.5">
        <span className="text-base font-medium tabular-nums">
          {formatIndexPrice(snapshot.close)}
        </span>
        <PriceChange
          change={snapshot.change}
          changeRate={snapshot.changeRate}
          symbol="arrow"
          size="xs"
        />
      </div>
    ) : (
      <div className="mt-0.5 text-sm text-muted-foreground">데이터 없음</div>
    )}
  </div>
);

export const OverseasIndexRow = ({ snapshotsByCode }: OverseasIndexRowProps) => {
  const latestDate = pickLatestDate(snapshotsByCode);
  return (
    <div>
      <div className="flex items-baseline gap-1.5 px-6 pt-3 pb-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>해외 · 미국</span>
        {latestDate && <span>· 기준일 {latestDate.slice(5)}</span>}
      </div>
      <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {OVERSEAS_INDEX_CODES.map((code) => (
          <OverseasCell
            key={code}
            label={getIndexMeta(code).label}
            snapshot={snapshotsByCode[code]}
          />
        ))}
      </div>
    </div>
  );
};
