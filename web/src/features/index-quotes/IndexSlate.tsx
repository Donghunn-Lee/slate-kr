"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";
import { PriceCountUp } from "@/entities/stock/PriceCountUp";
import { PriceChange } from "@/shared/components/PriceChange";
import { IndexMiniChart } from "@/entities/index/IndexMiniChart";
import { toIndexDisplayBars } from "@/entities/index/toIndexDisplayBars";
import type {
  ChartBar,
  IndexDailySnapshot,
  IndexIntradaySnapshot,
  PriceSign,
} from "@/shared/types/quote";
import {
  DOMESTIC_INDEX_CODES,
  INDEX_LABEL,
  type DomesticIndexCode,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import { INDEX_MINI_INTERVAL_MIN } from "@/shared/constants/chart";
import { useNow } from "@/shared/hooks/useNow";
import { useMarketCalendar } from "@/shared/contexts/MarketCalendarContext";
import {
  getKrxLastCloseDate,
  getKstDateAndMinutes,
  isKrxOpeningWindow,
} from "@/shared/utils/market";
import { buildIndexCell } from "@/shared/utils/buildIndexCell";
import { cn } from "@/lib/utils";
import { useIndexQuotes, type IndexCellData } from "./useIndexQuotes";
import { useIndexIntraday } from "./useIndexIntraday";
import { OverseasIndexList } from "./OverseasIndexList";

// 가격 span 등락색. flat 은 default foreground 유지 (색 없음) — 무채로 두어
// "값 색상은 상승/하락 유의 신호" 인 의미를 보존.
const PRICE_SIGN_CLASS: Record<PriceSign, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "",
};

const signOfChange = (change: number): PriceSign =>
  change > 0 ? "up" : change < 0 ? "down" : "flat";

// 국내 지수 값 포맷 — KRW 소수점 없이 콤마.
const formatKrw = (v: number): string => v.toLocaleString("ko-KR");

// 국내 4셀 DOM 순서. row-major 2×2 라 데스크톱 열 페어(KOSPI/KOSPI200 · KOSDAQ/KOSDAQ150)와
// 모바일 행 페어(KOSPI/KOSDAQ · KOSPI200/KOSDAQ150)가 같은 순서에서 동시에 성립한다.
const DOMESTIC_GRID_ORDER: readonly DomesticIndexCode[] = [
  "KOSPI",
  "KOSDAQ",
  "KOSPI200",
  "KOSDAQ150",
];

// 국내 2×2 그리드. 십자 구분선은 gap-px 사이로 비치는 그리드 배경 — divide-x/y 는 그리드
// 마지막 열·행의 바깥 경계에도 선을 긋기 때문에 쓰지 않는다. md:h-full 로 부모(2fr 열)
// 높이를 받아 grid-rows-2 가 셀에 절반씩 배분한다(<md 는 콘텐츠 높이).
const DOMESTIC_GRID_CLS =
  "grid grid-cols-2 grid-rows-2 gap-px bg-border/60 md:h-full";

// 국내 셀 공통 컨테이너 — 실셀·스켈레톤이 공유해 로딩→로드 전환 시 그리드가 흔들리지 않는다.
// bg-elevated 는 gap-px 구분선이 셀 뒤로 비치지 않게 하는 불투명 바닥(패널 bg 와 동일 토큰).
const CELL_CLS = "flex flex-col gap-2 bg-elevated px-4 py-3 md:gap-3 md:px-6 md:py-4";

// 차트 영역 높이의 단일 결정점. <md 는 명시 px 하나 — 실기기 조정 시 이 값만 바꾼다.
// md+ 는 flex-1 로 셀 잔여 높이를 채운다(셀 높이는 grid-rows-2 → 해외 리스트 높이에 종속).
// relative + 내부 absolute 레이어로 차트를 콘텐츠 흐름에서 떼어낸다 — lightweight-charts 가
// 자기 px 높이를 DOM 에 쓰므로 흐름에 두면 그 값이 행 높이의 하한이 되어 축소가 막힌다.
const CHART_AREA_CLS = "relative h-[95px] md:h-auto md:min-h-0 md:flex-1";

type IndexSlateProps = {
  overseasSnapshotsByCode: Record<OverseasIndexCode, IndexDailySnapshot | null>;
};

type IndexCellProps = {
  label: string;
  cell: IndexCellData;
  bars: ChartBar[];
  prevClose: number | null;
  intradayFailed: boolean;
  intradayLoading: boolean;
  isPreopen: boolean;
  // 미니차트가 그릴 거래일 — bars 에 섞인 전일 tail 을 잘라내는 축.
  tradingDate: string;
};

const IndexCell = ({ label, cell, bars, prevClose, intradayFailed, intradayLoading, isPreopen, tradingDate }: IndexCellProps) => (
  <div className={CELL_CLS}>
    <div>
      <div className="text-body font-bold text-muted-foreground">{label}</div>
      {cell.live ? (
        <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-value font-semibold tabular-nums md:text-headline md:font-medium",
              PRICE_SIGN_CLASS[cell.live.sign],
            )}
          >
            <PriceCountUp value={cell.live.price} />
          </span>
          <PriceChange
            change={cell.live.change}
            changeRate={cell.live.changeRate}
            sign={cell.live.sign}
            symbol="arrow"
            size="xs"
            stacked
            className="text-micro md:text-body-sm md:font-normal"
          />
        </div>
      ) : cell.fallback ? (
        <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-value font-semibold tabular-nums md:text-headline md:font-medium",
              PRICE_SIGN_CLASS[signOfChange(cell.fallback.change)],
            )}
          >
            {formatKrw(cell.fallback.close)}
          </span>
          <PriceChange
            change={cell.fallback.change}
            changeRate={cell.fallback.changeRate}
            symbol="arrow"
            size="xs"
            stacked
            className="text-micro md:text-body-sm md:font-normal"
          />
          <span className="text-micro text-muted-foreground">직전 거래일</span>
        </div>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-value font-semibold tabular-nums text-muted-foreground md:text-headline md:font-medium">—</span>
          <span className="text-body-sm text-muted-foreground">데이터 없음</span>
        </div>
      )}
    </div>
    <div className={CHART_AREA_CLS}>
      <div className="absolute inset-0">
        <IndexMiniChart bars={bars} prevClose={prevClose} failed={intradayFailed} isLoading={intradayLoading} isPreopen={isPreopen} tradingDate={tradingDate} />
      </div>
    </div>
  </div>
);

// 실셀과 같은 컨테이너·차트 영역 클래스로 로딩→로드 전환 시 셀 높이 점프 방지.
const CellSkeleton = ({ label }: { label: string }) => (
  <div className={CELL_CLS}>
    <div>
      <div className="text-body font-bold text-muted-foreground">{label}</div>
      <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
    </div>
    <div className={CHART_AREA_CLS} aria-hidden />
  </div>
);

const DomesticSkeleton = () => (
  <div className={DOMESTIC_GRID_CLS}>
    {DOMESTIC_GRID_ORDER.map((code) => (
      <CellSkeleton key={code} label={INDEX_LABEL[code]} />
    ))}
  </div>
);

const formatClock = (d: Date): string =>
  d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// 마감 라벨 기준일: quote live 존재 시 셀 값은 당일 종가 → 오늘 거래일(getKrxLastCloseDate).
// live 없이 EOD fallback 으로 강등된 경우엔 셀 값 자체가 전일 → fallback.date 유지.
// (마감 직후~EOD 적재 전 구간에서 셀 값/기준일 불일치 회피.)
// 라벨 규칙: 표시 값이 당일 세션 값이면 `정규장 마감 · 15:30`, 다른 날이면 `전일 종가 · MM.DD`.
// 개장 전 창은 오늘 거래일 기준가로 리셋된 상태라 `개장전 · MM.DD` 로 오늘 날짜만
// 표기하고 값 출처(전일 종가)는 붙이지 않는다. 종목 헤더(`stockHeaderLabel.ts`) 와
// MM.DD 포맷 통일.
// 장중 시각은 클라 시계가 아닌 셀 fetchedAt — 응답이 서버 캐시 히트여도 라벨이
// 실제 시세 조립 시각을 가리키게 한다.
const MarketStatus = ({
  marketOpen,
  openingWindow,
  hasLive,
  fallbackDate,
  fetchedAt,
}: {
  marketOpen: boolean;
  openingWindow: boolean;
  hasLive: boolean;
  fallbackDate?: string;
  fetchedAt: number | null;
}) => {
  const now = useNow();
  const calendar = useMarketCalendar();
  const referenceDate = hasLive && now ? getKrxLastCloseDate(now, calendar) : fallbackDate;
  if (marketOpen) {
    return (
      <div className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
        <span>정규장{fetchedAt !== null ? ` · ${formatClock(new Date(fetchedAt))}` : ""}</span>
      </div>
    );
  }
  const kstToday = now ? getKstDateAndMinutes(now).date : null;
  const sourceIsToday =
    referenceDate !== undefined && kstToday !== null && referenceDate === kstToday;
  const sourceLabel = sourceIsToday
    ? "정규장 마감 · 15:30"
    : referenceDate
      ? `전일 종가 · ${referenceDate.slice(5, 7)}.${referenceDate.slice(8, 10)}`
      : null;
  const text = openingWindow
    ? kstToday
      ? `개장전 · ${kstToday.slice(5, 7)}.${kstToday.slice(8, 10)}`
      : "개장전"
    : sourceLabel ?? "정규장 마감";
  return <div className="text-body-sm text-muted-foreground">{text}</div>;
};

const EMPTY_BARS: ChartBar[] = [];

type DomesticDisplay = { bars: ChartBar[]; prevClose: number | null };

// snapshot 첫 봉의 `close - change` 로 prevClose 를 유도. 리샘플 후엔 close 가
// 버킷 마지막 값으로 바뀌므로 반드시 raw snapshot 에서 뽑는다.
const derivePrevClose = (
  snapshots: IndexIntradaySnapshot[] | undefined,
): number | null => {
  if (!snapshots || snapshots.length === 0) return null;
  const first = snapshots[0];
  const pc = first.close - first.change;
  return pc > 0 ? pc : null;
};

export const IndexSlate = ({ overseasSnapshotsByCode }: IndexSlateProps) => {
  const { data, isLoading, isError } = useIndexQuotes();
  const { data: intraday, isLoading: intradayLoading } = useIndexIntraday();
  const now = useNow();
  const calendar = useMarketCalendar();
  // 개장 전 창 판정은 클라 시계 축. now=null(SSR·첫 렌더)은 false 로 흘려 hydration 유지.
  // 창 안의 intraday 는 전일 봉을 서빙하므로 미니차트가 비는 건 DB 0봉일 때뿐 — 그때만
  // empty 문구를 "장중 데이터 없음" 대신 "개장 전" 으로 대체한다.
  const openingWindow =
    now !== null && isKrxOpeningWindow(data?.session, now, calendar);

  const displayByCode = useMemo<Record<DomesticIndexCode, DomesticDisplay>>(() => {
    const out = {} as Record<DomesticIndexCode, DomesticDisplay>;
    for (const code of DOMESTIC_INDEX_CODES) {
      const snaps = intraday?.quotes[code];
      out[code] = {
        bars: snaps ? toIndexDisplayBars(snaps, INDEX_MINI_INTERVAL_MIN, code) : EMPTY_BARS,
        prevClose: derivePrevClose(snaps),
      };
    }
    return out;
  }, [intraday]);

  // 개장 전 등락 규칙을 /indices 표면과 동일하게 buildIndexCell 로 통과 —
  // 홈과 상세 표면이 같은 셀 규칙을 공유하도록 한다.
  const cellByCode = useMemo<Record<DomesticIndexCode, IndexCellData | undefined> | null>(() => {
    if (!data) return null;
    const out = {} as Record<DomesticIndexCode, IndexCellData | undefined>;
    for (const code of DOMESTIC_INDEX_CODES) {
      out[code] = buildIndexCell({
        isDomestic: true,
        name: INDEX_LABEL[code],
        domesticCell: data.quotes[code],
        overseasLatestBar: null,
        latestDaily: null,
        session: data.session,
        openingWindow,
      });
    }
    return out;
  }, [data, openingWindow]);

  // 헤더는 4셀을 한 시각으로 대표하므로 가장 오래된 fetchedAt 을 택한다 —
  // 어떤 셀보다도 새 시각을 주장하지 않도록.
  const oldestFetchedAt = useMemo<number | null>(() => {
    if (!data) return null;
    const stamps = DOMESTIC_INDEX_CODES.map(
      (code) => data.quotes[code].fetchedAt,
    ).filter((t): t is number => t !== null);
    return stamps.length > 0 ? Math.min(...stamps) : null;
  }, [data]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-end gap-3">
          <h2 className="text-value font-semibold text-foreground">주요 지수</h2>
          {data ? (
            <MarketStatus
              marketOpen={data.marketOpen}
              openingWindow={openingWindow}
              hasLive={data.quotes.KOSPI.live !== null}
              fallbackDate={data.quotes.KOSPI.fallback?.date}
              fetchedAt={oldestFetchedAt}
            />
          ) : null}
        </div>
        <Link
          href="/stocks/indices"
          className="flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          전체 보기 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <StockPanel className="overflow-hidden p-0">
        {/* md+: 좌 국내 2fr : 우 해외 1fr — outer grid 의 row-stretch 로 좌측이 해외 리스트
            높이에 맞춰지고, md:h-full 체인(2fr div → 2×2 grid)으로 각 셀에 절반씩 전달된다.
            <md: 국내 2×2 그리드 아래 해외 리스트 스택(divide-y 로 경계).
            overflow-hidden 은 셀의 불투명 bg 가 패널 라운드 코너를 덮지 않게 한다. */}
        <div className="divide-y divide-border/60 md:grid md:grid-cols-[2fr_1fr] md:divide-x md:divide-y-0">
          <div className="md:h-full">
            {isError && !data ? (
              <div className="px-6 py-6 text-body text-muted-foreground">
                지수 시세를 불러오지 못했습니다
              </div>
            ) : isLoading || !data ? (
              <DomesticSkeleton />
            ) : (
              <div className={DOMESTIC_GRID_CLS}>
                {DOMESTIC_GRID_ORDER.map((code) => (
                  <IndexCell
                    key={code}
                    label={INDEX_LABEL[code]}
                    cell={cellByCode?.[code] ?? data.quotes[code]}
                    bars={displayByCode[code].bars}
                    prevClose={displayByCode[code].prevClose}
                    intradayFailed={intraday?.failed[code] ?? false}
                    intradayLoading={intradayLoading}
                    isPreopen={openingWindow}
                    tradingDate={data.date}
                  />
                ))}
              </div>
            )}
          </div>
          <OverseasIndexList snapshotsByCode={overseasSnapshotsByCode} />
        </div>
      </StockPanel>
    </section>
  );
};
