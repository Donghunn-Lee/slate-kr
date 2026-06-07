"use client";

import { useEffect } from "react";
import { useRecentVisitedStore } from "./useRecentVisitedStore";

type RecentVisitedRecorderProps = {
  ticker: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
};

export const RecentVisitedRecorder = ({ ticker, name, market }: RecentVisitedRecorderProps) => {
  const add = useRecentVisitedStore((s) => s.add);

  useEffect(() => {
    add(ticker, name, market);
  }, [ticker, name, market, add]);

  return null;
};
