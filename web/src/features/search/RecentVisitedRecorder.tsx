"use client";

import { useEffect } from "react";
import { useRecentVisitedStore } from "./useRecentVisitedStore";

type RecentVisitedRecorderProps = {
  ticker: string;
  name: string;
};

export const RecentVisitedRecorder = ({ ticker, name }: RecentVisitedRecorderProps) => {
  const add = useRecentVisitedStore((s) => s.add);

  useEffect(() => {
    add(ticker, name);
  }, [ticker, name, add]);

  return null;
};
