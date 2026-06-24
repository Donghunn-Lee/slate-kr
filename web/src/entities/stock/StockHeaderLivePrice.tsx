"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { useStockQuote } from "@/features/stock-quote/useStockQuote";
import { PriceCountUp } from "./PriceCountUp";

type StockHeaderLivePriceProps = {
  ticker: string;
  initialPrice: number;
  initialPrev: number | null;
};

export const StockHeaderLivePrice = ({
  ticker,
  initialPrice,
  initialPrev,
}: StockHeaderLivePriceProps) => {
  const { data, dataUpdatedAt } = useStockQuote(ticker);

  const live = data?.quote ?? null;
  const session = data?.session;
  const updatedAtText = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "";

  // NXT 미지원 종목: after/after_close/pre인데 NX 응답이 null. regular는 제외(폴링 일시실패는 "실시간" 유지).
  const isNxtMiss =
    (session === "after" || session === "after_close" || session === "pre") &&
    live === null;

  // preopen/closed + NXT 미지원: 새 거래일 기준가(전일 종가) + 변동 0% 강제. quote 무시.
  const forceFlat = session === "preopen" || session === "closed" || isNxtMiss;

  const displayPrice = forceFlat ? initialPrice : (live?.price ?? initialPrice);
  const displayChange = forceFlat
    ? 0
    : live !== null
      ? live.change
      : initialPrev !== null
        ? initialPrice - initialPrev
        : null;
  const displayChangeRate = forceFlat
    ? 0
    : live !== null
      ? live.changeRate
      : initialPrev !== null && initialPrev !== 0
        ? ((initialPrice - initialPrev) / initialPrev) * 100
        : null;

  const isRise = displayChange !== null && displayChange > 0;
  const isFall = displayChange !== null && displayChange < 0;
  const changeColor = isRise
    ? "text-price-up"
    : isFall
      ? "text-price-down"
      : "text-muted-foreground";
  const changeSign = isRise ? "+" : "";

  const prevDisplayRef = useRef<number>(initialPrice);
  const fromPrice = prevDisplayRef.current;
  useEffect(() => {
    prevDisplayRef.current = displayPrice;
  }, [displayPrice]);

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <span className="text-4xl font-bold tracking-tight">
        <PriceCountUp from={fromPrice} to={displayPrice} />원
      </span>
      {displayChange !== null && displayChangeRate !== null && (
        <span className={`mb-1 text-lg font-medium ${changeColor}`}>
          {changeSign}
          {displayChange.toLocaleString("ko-KR")}원 ({changeSign}
          {displayChangeRate.toFixed(2)}%)
        </span>
      )}
      {session && (
        <span className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {isNxtMiss ? (
            "장 마감"
          ) : session === "regular" ? (
            <>
              <span
                className="inline-block size-1.5 rounded-full bg-emerald-500"
                aria-hidden
              />
              실시간{updatedAtText && ` · ${updatedAtText}`}
            </>
          ) : session === "after" ? (
            "애프터마켓"
          ) : session === "after_close" ? (
            "애프터마켓 종가"
          ) : session === "pre" ? (
            "프리마켓"
          ) : session === "preopen" ? (
            "장 시작 전"
          ) : (
            "장 마감"
          )}
        </span>
      )}
    </div>
  );
};
