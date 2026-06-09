"use client";

import { useEffect, useRef, useState } from "react";

export type SearchResultItem = {
  ticker: string;
  name: string;
  market: string;
};

type UseStockSearchResult = {
  results: SearchResultItem[];
  isLoading: boolean;
  error: string | null;
};

const DEBOUNCE_MS = 300;

export const useStockSearch = (query: string): UseStockSearchResult => {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed === "") {
      if (abortRef.current) abortRef.current.abort();
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);
      setResults([]);

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search failed");
        const data: SearchResultItem[] = await res.json();
        setResults(data);
        setIsLoading(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setIsLoading(false);
        setError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    }, DEBOUNCE_MS);
  }, [query]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { results, isLoading, error };
};
