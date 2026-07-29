"use client";

import { PriceChange } from "@/shared/components/PriceChange";
import { IndexSparkline } from "@/entities/index/IndexSparkline";
import {
  OVERSEAS_INDEX_CODES,
  getIndexMeta,
  INDEX_LABEL,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import type {
  IndexDailySnapshot,
  IndexIntradaySnapshot,
} from "@/shared/types/quote";
import {
  useOverseasIndexIntraday,
  type OverseasIndexIntradayResponse,
} from "@/features/index-quotes/useOverseasIndexIntraday";
import { buildIndexCell } from "@/shared/utils/buildIndexCell";

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

const EMPTY_BARS: IndexIntradaySnapshot[] = [];

// row 3셀 → intraday 응답 키 매핑. .DJI 는 KIS intraday 미지원 → 빈 슬롯.
type IntradayKey = keyof OverseasIndexIntradayResponse["quotes"];
const INTRADAY_KEY: Record<OverseasIndexCode, IntradayKey | null> = {
  SPX: "spx",
  ".DJI": null,
  COMP: "comp",
};

type OverseasCellProps = {
  code: OverseasIndexCode;
  label: string;
  snapshot: IndexDailySnapshot | null;
  bars: IndexIntradaySnapshot[];
  intradayFailed: boolean;
};

const OverseasCell = ({
  code,
  label,
  snapshot,
  bars,
  intradayFailed,
}: OverseasCellProps) => {
  // 최신 분봉이 있으면 텍스트도 라이브(가격·등락·등락률)로 표시. 없거나 .DJI
  // (intraday 미지원) 는 snapshot(EOD) fallback. buildIndexCell 이 두 경로를 통합.
  const overseasLatestBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const cell = buildIndexCell({
    isDomestic: false,
    name: INDEX_LABEL[code],
    domesticCell: undefined,
    overseasLatestBar,
    latestDaily: snapshot,
  });
  return (
    <div className="flex flex-1 items-center justify-between gap-3 px-6 py-3">
      <div className="flex flex-col">
        <div className="text-xs text-muted-foreground">{label}</div>
        {cell?.live ? (
          <div className="mt-0.5 flex flex-col items-start gap-0.5">
            <span className="text-base font-medium tabular-nums">
              {formatIndexPrice(cell.live.price)}
            </span>
            <PriceChange
              change={cell.live.change}
              changeRate={cell.live.changeRate}
              sign={cell.live.sign}
              symbol="arrow"
              size="xs"
            />
          </div>
        ) : cell?.fallback ? (
          <div className="mt-0.5 flex flex-col items-start gap-0.5">
            <span className="text-base font-medium tabular-nums">
              {formatIndexPrice(cell.fallback.close)}
            </span>
            <PriceChange
              change={cell.fallback.change}
              changeRate={cell.fallback.changeRate}
              symbol="arrow"
              size="xs"
            />
          </div>
        ) : (
          <div className="mt-0.5 text-sm text-muted-foreground">데이터 없음</div>
        )}
      </div>
      <div className="min-w-[110px] flex-1">
        <IndexSparkline bars={bars} failed={intradayFailed} />
      </div>
    </div>
  );
};

export const OverseasIndexRow = ({ snapshotsByCode }: OverseasIndexRowProps) => {
  const latestDate = pickLatestDate(snapshotsByCode);
  const { data: intraday } = useOverseasIndexIntraday();
  return (
    <div>
      <div className="flex items-baseline gap-1.5 px-6 pt-3 pb-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>해외 · 미국</span>
        {latestDate && <span>· 기준일 {latestDate.slice(5)}</span>}
      </div>
      <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {OVERSEAS_INDEX_CODES.map((code) => {
          const key = INTRADAY_KEY[code];
          const bars = key ? intraday?.quotes[key] ?? EMPTY_BARS : EMPTY_BARS;
          const intradayFailed = key ? intraday?.failed[key] ?? false : false;
          return (
            <OverseasCell
              key={code}
              code={code}
              label={getIndexMeta(code).label}
              snapshot={snapshotsByCode[code]}
              bars={bars}
              intradayFailed={intradayFailed}
            />
          );
        })}
      </div>
    </div>
  );
};
