"use client";

import { useEffect } from "react";
import { useRecentSearchesStore } from "./useRecentSearchesStore";

type RecentSearchRecorderProps = {
  ticker: string;
  name: string;
};

export const RecentSearchRecorder = ({ ticker, name }: RecentSearchRecorderProps) => {
  const add = useRecentSearchesStore((s) => s.add);

  useEffect(() => {
    add(ticker, name);
  }, [ticker, name, add]);

  return null;
};
