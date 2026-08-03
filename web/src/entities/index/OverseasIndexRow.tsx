"use client";

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
import { MiniIndexCell } from "@/features/index-quotes/MiniIndexCell";
import { buildIndexCell } from "@/shared/utils/buildIndexCell";

type OverseasIndexRowProps = {
  snapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>;
};

// 해외 지수 값 포맷 — 소숫점 최대 2자리. 국내(KRW 콤마)와 다른 규칙.
const formatIndexPrice = (v: number): string =>
  v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

// 해외 셀 PC(sm+) 스타일: 라벨 text-xs(12) · 가격 text-base(16) medium.
// MiniIndexCell 의 모바일 기본(text-value semibold / text-body bold) 을 sm 에서 override.
const OVERSEAS_LABEL_SM = "sm:text-caption";
const OVERSEAS_PRICE_SM = "sm:text-base sm:font-medium";

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

export const OverseasIndexRow = ({ snapshotsByCode }: OverseasIndexRowProps) => {
  const latestDate = pickLatestDate(snapshotsByCode);
  const { data: intraday } = useOverseasIndexIntraday();

  // 코드별 프리컴퓨트 — 데스크톱/모바일 두 그리드에서 동일 참조로 재사용.
  const cells = OVERSEAS_INDEX_CODES.map((code) => {
    const key = INTRADAY_KEY[code];
    const bars = key ? intraday?.quotes[key] ?? EMPTY_BARS : EMPTY_BARS;
    const intradayFailed = key ? intraday?.failed[key] ?? false : false;
    const overseasLatestBar = bars.length > 0 ? bars[bars.length - 1] : null;
    const cell = buildIndexCell({
      isDomestic: false,
      name: INDEX_LABEL[code],
      domesticCell: undefined,
      overseasLatestBar,
      latestDaily: snapshotsByCode[code],
    });
    return {
      code,
      label: getIndexMeta(code).label,
      cell,
      bars,
      intradayFailed,
    };
  });

  return (
    <div>
      <div className="flex items-baseline gap-1.5 px-4 pt-3 pb-1 text-micro uppercase tracking-widest text-muted-foreground sm:px-6">
        <span>해외 · 미국</span>
        {latestDate && <span>· 기준일 {latestDate.slice(5)}</span>}
      </div>
      {/* 데스크톱: 기존 3열 유지. */}
      <div className="hidden grid-cols-3 divide-x divide-border/60 sm:grid">
        {cells.map(({ code, label, cell, bars, intradayFailed }) => (
          <MiniIndexCell
            key={code}
            label={label}
            cell={cell}
            bars={bars}
            intradayFailed={intradayFailed}
            formatPrice={formatIndexPrice}
            labelClassName={OVERSEAS_LABEL_SM}
            priceClassName={OVERSEAS_PRICE_SM}
          />
        ))}
      </div>
      {/* 모바일: 2열 그리드 — 1행 SPX | .DJI, 2행 COMP 좌측 한 칸 + 우측 빈 셀
          (divide-x 세로선을 상단 행과 정렬 유지). */}
      <div className="divide-y divide-border/60 sm:hidden">
        <div className="grid grid-cols-2 divide-x divide-border/60">
          <MiniIndexCell
            label={cells[0].label}
            cell={cells[0].cell}
            bars={cells[0].bars}
            intradayFailed={cells[0].intradayFailed}
            formatPrice={formatIndexPrice}
            labelClassName={OVERSEAS_LABEL_SM}
            priceClassName={OVERSEAS_PRICE_SM}
          />
          <MiniIndexCell
            label={cells[1].label}
            cell={cells[1].cell}
            bars={cells[1].bars}
            intradayFailed={cells[1].intradayFailed}
            formatPrice={formatIndexPrice}
            labelClassName={OVERSEAS_LABEL_SM}
            priceClassName={OVERSEAS_PRICE_SM}
          />
        </div>
        <div className="grid grid-cols-2 divide-x divide-border/60">
          <MiniIndexCell
            label={cells[2].label}
            cell={cells[2].cell}
            bars={cells[2].bars}
            intradayFailed={cells[2].intradayFailed}
            formatPrice={formatIndexPrice}
            labelClassName={OVERSEAS_LABEL_SM}
            priceClassName={OVERSEAS_PRICE_SM}
          />
          <div aria-hidden />
        </div>
      </div>
    </div>
  );
};
