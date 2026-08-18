"use client";

import { format } from "date-fns";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import { PriceChange } from "@/shared/components/PriceChange";
import type { StockQuote } from "@/shared/types/quote";
import type { KrxSession } from "@/shared/utils/market";
import { PriceCountUp } from "./PriceCountUp";

type StockHeaderLivePriceProps = {
  ticker: string;
  initialPrice: number;
  initialChange: number | null;
  initialChangeRate: number | null;
};

// 정규장 개장 전 KRX 기준 0% 리셋 창.
//   - preopen (06:00~08:00, 08:50~09:00): 세션 자체가 리셋 창.
//   - pre (08:00~08:50) + live=null: KRX-only 종목 (NX 응답 iscd=null → normalize=null).
//     NXT 상장 종목은 live 실봉이 있어 리셋 대신 프리마켓 값 표시로 흘린다.
export const isPreMarketReset = (
  session: KrxSession | undefined,
  live: StockQuote | null,
): boolean =>
  session === "preopen" || (session === "pre" && live === null);

// after 계열 + closed 의 KRX-only 폴백 창 — 직전 거래일 값 보존 + "장 마감" 라벨.
// pre 는 isPreMarketReset 이 처리하므로 여기서 제외.
// failed=true(=KIS 실패) 는 정상 NXT 미지원과 구분해야 하므로 !isFailedQuote 로 게이트.
export const isClosedLikeMiss = (
  session: KrxSession | undefined,
  live: StockQuote | null,
  isFailedQuote: boolean,
): boolean =>
  !isFailedQuote &&
  (session === "after" ||
    session === "after_close" ||
    session === "closed") &&
  live === null;

export const StockHeaderLivePrice = ({
  ticker,
  initialPrice,
  initialChange,
  initialChangeRate,
}: StockHeaderLivePriceProps) => {
  const { data, dataUpdatedAt } = useStockQuote(ticker);

  const live = data?.quote ?? null;
  const session = data?.session;
  const updatedAtText = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "";

  // route catch(=KIS 실패) 진입 신호. quote:null 이 정상 empty(NXT 미지원 등) 인지 실패인지
  // 구분해 세션 라벨(애프터마켓 등) 은 유지한 채 "일시 지연" 배지만 얹기 위한 축.
  const isFailedQuote = data?.failed ?? false;

  const preReset = isPreMarketReset(session, live);
  const closedLike = isClosedLikeMiss(session, live, isFailedQuote);

  const displayPrice =
    preReset || closedLike ? initialPrice : (live?.price ?? initialPrice);

  const displayChange = preReset
    ? 0
    : closedLike
      ? initialChange
      : (live?.change ?? initialChange);

  const displayChangeRate = preReset
    ? 0
    : closedLike
      ? initialChangeRate
      : (live?.changeRate ?? initialChangeRate);

  // 세션 라벨은 실패 여부와 무관하게 유지 — 실패 시엔 "일시 지연" 배지가 별도로 붙는다.
  // pre 창의 KRX-only 종목(live=null) 은 preopen 과 동일하게 "장 시작 전" — 정규장
  // 개장 전 KRX 기준 표시 창.
  // after_close 와 closed 는 같은 "애프터마켓 종가" 카피 — closed 세션에서도 KIS 가
  // 직전 거래일 NXT 20:00 종가를 반환하므로 의미가 정확히 일치한다.
  const labelText = closedLike
    ? "장 마감"
    : session === "regular"
      ? "실시간"
      : session === "after"
        ? "애프터마켓"
        : session === "after_close" || session === "closed"
          ? "애프터마켓 종가"
          : session === "pre"
            ? live === null
              ? "장 시작 전"
              : "프리마켓"
            : session === "preopen"
              ? "장 시작 전"
              : "장 마감";

  // 시각 표시: 활성 세션 + live 있으면 갱신 시각, after_close/closed + NXT live는 20:00 고정,
  // closedLike(비NXT after/after_close) 및 closed 폴백은 정규장 마감 15:30 고정.
  // 06시 이후~정규장 시작 사이(preopen, pre KRX-only) 는 시각 없음.
  const timeText = (() => {
    if ((session === "regular" || session === "after" || session === "pre") && live !== null) {
      return updatedAtText;
    }
    if ((session === "after_close" || session === "closed") && live !== null) return "20:00";
    if (closedLike && (session === "after" || session === "after_close")) return "15:30";
    if (session === "closed") return "15:30";
    return "";
  })();

  if (session === undefined) {
    return (
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="h-10 w-36 animate-pulse rounded bg-muted" />
        <div className="mb-1 h-5 w-28 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <span className="text-display font-bold tracking-tight">
        <PriceCountUp value={displayPrice} />원
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
      {session && (
        <span className="mb-1.5 inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
          {timeText && <span className="tabular-nums">{timeText}</span>}
          {timeText && <span aria-hidden>·</span>}
          {session === "regular" && !isFailedQuote && (
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
          )}
          <span>{labelText}</span>
          {isFailedQuote && (
            <span className="rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground">
              일시 지연
            </span>
          )}
        </span>
      )}
    </div>
  );
};
