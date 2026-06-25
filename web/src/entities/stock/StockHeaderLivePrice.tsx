"use client";

import { format } from "date-fns";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import { PriceChange } from "@/shared/components/PriceChange";
import { PriceCountUp } from "./PriceCountUp";

type StockHeaderLivePriceProps = {
  ticker: string;
  initialPrice: number;
  initialChange: number | null;
  initialChangeRate: number | null;
};

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

  // NXT 미지원 종목: after/after_close/pre인데 NX 응답이 null. regular는 제외(폴링 일시실패는 "실시간" 유지).
  const isNxtMiss =
    (session === "after" || session === "after_close" || session === "pre") && live === null;

  // preopen: 새 거래일 개장 전 → 전일종가 + 0%
  // closed / NXT miss: 장 없음 → 직전 거래일 종가 + 직전 거래일 등락 유지
  const isPreopen = session === "preopen";
  const isClosedLike = session === "closed" || isNxtMiss;

  const displayPrice =
    isPreopen || isClosedLike ? initialPrice : (live?.price ?? initialPrice);

  const displayChange = isPreopen
    ? 0
    : isClosedLike
      ? initialChange
      : (live?.change ?? initialChange);

  const displayChangeRate = isPreopen
    ? 0
    : isClosedLike
      ? initialChangeRate
      : (live?.changeRate ?? initialChangeRate);

  const labelText = isNxtMiss
    ? "장 마감"
    : session === "regular"
      ? "실시간"
      : session === "after"
        ? "애프터마켓"
        : session === "after_close"
          ? "애프터마켓 종가"
          : session === "pre"
            ? "프리마켓"
            : session === "preopen"
              ? "장 시작 전"
              : "장 마감"; // closed

  // 시각 표시: 활성 세션은 갱신 시각, after_close는 20:00 고정,
  // 장 마감(=isNxtMiss after/after_close + closed)은 정규장 마감 15:30 고정.
  // 06시 이후~정규장 시작 사이(preopen, isNxtMiss pre)는 시각 없음.
  const timeText = (() => {
    if ((session === "regular" || session === "after" || session === "pre") && live !== null) {
      return updatedAtText;
    }
    if (session === "after_close" && live !== null) return "20:00";
    if ((isNxtMiss && (session === "after" || session === "after_close")) || session === "closed") {
      return "15:30";
    }
    return "";
  })();

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <span className="text-4xl font-bold tracking-tight">
        <PriceCountUp from={initialPrice} to={displayPrice} />원
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
        <span className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {session === "regular" && (
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
          )}
          {labelText}
          {timeText && ` · ${timeText}`}
        </span>
      )}
    </div>
  );
};
