"use client";

import { format } from "date-fns";
import { useState } from "react";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import { PriceChange } from "@/shared/components/PriceChange";
import type { QuoteMarket } from "@/shared/utils/market";
import {
  defaultMarketForSession,
  getKrxSessionState,
  getKstDateAndMinutes,
} from "@/shared/utils/market";
import { cn } from "@/lib/utils";
import { PriceCountUp } from "./PriceCountUp";
import {
  computeHeaderLabel,
  isClosedLikeMiss,
  isPreMarketReset,
} from "./stockHeaderLabel";

// 술어는 stockHeaderLabel 에 co-locate, 외부 소비 편의 위해 re-export.
export { isPreMarketReset, isClosedLikeMiss };

type StockHeaderLivePriceProps = {
  ticker: string;
  initialPrice: number;
  initialChange: number | null;
  initialChangeRate: number | null;
  // SSR daily_prices 최신 행 date ('YYYY-MM-DD', KST 축). KRX 탭 비-regular 라벨 산출.
  initialDate: string | null;
  // NXT 취급 여부. true 일 때만 KRX/NXT 토글 노출 · market 파라미터 부착.
  nxEligible: boolean | null;
};

const MARKET_BUTTONS: { value: QuoteMarket; label: string }[] = [
  { value: "krx", label: "KRX" },
  { value: "nxt", label: "NXT" },
];

export const StockHeaderLivePrice = ({
  ticker,
  initialPrice,
  initialChange,
  initialChangeRate,
  initialDate,
  nxEligible,
}: StockHeaderLivePriceProps) => {
  const showToggle = nxEligible === true;

  // 마운트 시 클라 세션 1회로 기본 탭 결정 — 이후 세션 전환에도 사용자 선택 유지.
  const [market, setMarket] = useState<QuoteMarket>(() =>
    defaultMarketForSession(getKrxSessionState()),
  );

  const marketArg: QuoteMarket | undefined = showToggle ? market : undefined;

  // KRX 탭 비-regular 는 서버 응답이 항상 quote:null → 폴링 비활성.
  const clientSession = getKrxSessionState();
  const isKrxOffRegular = showToggle && market === "krx" && clientSession !== "regular";

  const { data, dataUpdatedAt } = useStockQuote(ticker, {
    market: marketArg,
    enabled: !isKrxOffRegular,
  });

  const live = data?.quote ?? null;
  const session = data?.session;
  const updatedAtText = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "";

  // quote:null 이 정상 empty(NXT 미지원 등) 인지 KIS 실패인지 구분하는 신호.
  // 세션 라벨은 유지한 채 "일시 지연" 배지만 얹기 위한 축.
  const isFailedQuote = data?.failed ?? false;

  const preReset = isPreMarketReset(session, live);
  const closedLike = isClosedLikeMiss(session, live, isFailedQuote);

  // KRX 탭 비-regular 는 라이브 응답이 없으므로 SSR initial 값 강제.
  const forceInitial = showToggle && market === "krx" && clientSession !== "regular";

  const displayPrice = forceInitial
    ? initialPrice
    : preReset || closedLike
      ? initialPrice
      : live?.price ?? initialPrice;

  const displayChange = forceInitial
    ? initialChange
    : preReset
      ? 0
      : closedLike
        ? initialChange
        : live?.change ?? initialChange;

  const displayChangeRate = forceInitial
    ? initialChangeRate
    : preReset
      ? 0
      : closedLike
        ? initialChangeRate
        : live?.changeRate ?? initialChangeRate;

  const kstToday = getKstDateAndMinutes().date;
  // 비-regular KRX 강제 케이스는 서버 응답 대신 clientSession 을 라벨에 넘긴다.
  const labelSession = forceInitial ? clientSession : session;
  const { labelText, timeText } = computeHeaderLabel({
    session: labelSession,
    market: marketArg ?? "nxt", // 미지정 경로는 NXT 매핑과 동형.
    live,
    isFailedQuote,
    initialDate,
    kstToday,
    updatedAtText,
  });

  // 초기 로드 스켈레톤 — 토글 미노출 종목·NXT 탭. KRX 탭은 initial 값으로 즉시 표시.
  if (session === undefined && !forceInitial) {
    return (
      <div className="mt-4">
        {showToggle && <MarketToggleSkeleton />}
        <div className="mt-1 flex flex-wrap items-end gap-3">
          <div className="h-10 w-36 animate-pulse rounded bg-muted" />
          <div className="mb-1 h-5 w-28 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {showToggle && (
        <div className="mb-1.5">
          <MarketToggle value={market} onChange={setMarket} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <span className="text-display font-bold tracking-tight">
          {/* market 을 key 로 부여 → 탭 전환 시 remount 로 카운트업 애니 억제 (소스 전환).
              동일 탭 내 실시간 갱신은 key 유지 → 정상 카운트업. */}
          <PriceCountUp key={market} value={displayPrice} />원
        </span>
        {displayChange !== null && displayChangeRate !== null && (
          <PriceChange
            change={displayChange}
            changeRate={displayChangeRate}
            symbol="sign"
            unit="원"
            size="lg"
            className="mb-1"
          />
        )}
        <span className="mb-1.5 inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
          {session === "regular" && !isFailedQuote && (
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
          )}
          <span>{labelText}</span>
          {timeText && <span aria-hidden>·</span>}
          {timeText && <span className="tabular-nums">{timeText}</span>}
          {isFailedQuote && (
            <span className="rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground">
              일시 지연
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

// KRX/NXT 세그먼티드 토글 — 헤더 무채색 원칙, flat 스타일.
// 그룹은 상·좌·우 테두리만, 하단은 각 버튼이 담당 → 활성 버튼만 border-b 를 투명으로 두어
// 아래 가격 영역과 이어진 느낌 (폴더 탭 상단부 어감). 비활성은 border-b border-default 로
// 라인 유지. transition 없음.
const TOGGLE_GROUP_CLS =
  "inline-flex h-6 items-stretch overflow-hidden border-t border-x border-default divide-x divide-default sm:h-7";

const toggleButtonCls = (active: boolean) =>
  cn(
    "inline-flex items-center justify-center border-b px-2 text-caption sm:px-2.5",
    active
      ? "border-transparent bg-elevated text-foreground font-medium"
      : "border-default bg-muted text-muted-foreground hover:text-foreground",
  );

const MarketToggle = ({
  value,
  onChange,
}: {
  value: QuoteMarket;
  onChange: (v: QuoteMarket) => void;
}) => (
  // 우하단 연장선 — 폴더 탭 하단 라인이 오른쪽으로 이어진 감. 길이는 토글 자체 폭 근사(w-24/28).
  // border-b 만 있는 얇은 div, 그룹 wrapper 와 같은 h 로 하단 y 좌표 일치.
  <div className="inline-flex items-stretch">
    <div className={TOGGLE_GROUP_CLS} role="group" aria-label="시장 구분">
      {MARKET_BUTTONS.map(({ value: v, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={toggleButtonCls(active)}
          >
            {label}
          </button>
        );
      })}
    </div>
    <div
      aria-hidden
      className="h-6 w-24 border-b border-default sm:h-7 sm:w-28"
    />
  </div>
);

// 스켈레톤에서도 토글 자리를 미리 잡아 마운트 시 레이아웃 점프 방지.
const MarketToggleSkeleton = () => (
  <div className="h-6 w-[92px] animate-pulse rounded-md bg-muted sm:h-7" />
);
