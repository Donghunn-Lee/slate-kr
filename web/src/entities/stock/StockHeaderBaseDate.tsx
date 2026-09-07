"use client";

import { useMarketCalendar } from "@/shared/contexts/MarketCalendarContext";
import { useNow } from "@/shared/hooks/useNow";
import {
  getKrxTradingDate,
  getKstDateAndMinutes,
  isKrxLatePreopen,
} from "@/shared/utils/market";

type StockHeaderBaseDateProps = {
  // SSR daily_prices 최신 행 date ('YYYY-MM-DD').
  latestDate: string;
};

// 헤더가 표시 중인 가격이 속한 KRX 거래일. daily_prices 최신 행 날짜는 EOD 적재
// 시각에 종속되므로(마감 직후엔 전일 행이 최신) 세션 축으로 다시 구한다.
// now=null(SSR·첫 렌더)은 SSR 값 그대로 — hydration mismatch 방지.
export const StockHeaderBaseDate = ({ latestDate }: StockHeaderBaseDateProps) => {
  const now = useNow();
  const calendar = useMarketCalendar();
  // getKrxTradingDate 는 08:50~09:00 preopen 을 전일로 보고한다.
  const baseDate =
    now === null
      ? latestDate
      : isKrxLatePreopen(now, calendar)
        ? getKstDateAndMinutes(now).date
        : getKrxTradingDate(now, calendar);
  return <span>기준일 {baseDate}</span>;
};
