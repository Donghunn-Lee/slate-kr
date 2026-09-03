"use client";

import { createContext, useContext } from "react";
import type { MarketCalendar } from "@/shared/types/marketCalendar";

const MarketCalendarContext = createContext<MarketCalendar | undefined>(
  undefined,
);

type MarketCalendarProviderProps = {
  calendar: MarketCalendar;
  children: React.ReactNode;
};

export const MarketCalendarProvider = ({
  calendar,
  children,
}: MarketCalendarProviderProps) => {
  return (
    <MarketCalendarContext.Provider value={calendar}>
      {children}
    </MarketCalendarContext.Provider>
  );
};

// provider 밖에서는 undefined 반환 — 소비처의 optional calendar 인자 계약과
// 동일하게 "없으면 정적 폴백"이 되도록 한다. throw 하지 않는다.
export const useMarketCalendar = (): MarketCalendar | undefined =>
  useContext(MarketCalendarContext);
