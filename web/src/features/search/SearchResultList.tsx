"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { StockSearchPage, StockSearchResult } from "@/shared/types/stock";
import { SearchResultCard } from "./SearchResultCard";

const PAGE_SIZE = 20;

type SearchResultListProps = {
  initialResults: StockSearchResult[];
  initialHasMore: boolean;
  query: string;
};

export const SearchResultList = ({
  initialResults,
  initialHasMore,
  query,
}: SearchResultListProps) => {
  const [results, setResults] = useState<StockSearchResult[]>(initialResults);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadMore = async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(PAGE_SIZE),
        offset: String(results.length),
      });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      const data: StockSearchPage = await res.json();
      setResults((prev) => [...prev, ...data.results]);
      setHasMore(data.hasMore);
    } catch {
      setError("결과를 불러오지 못했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <p className="mb-4 text-xs text-muted-foreground">
        {results.length}개 종목{hasMore ? "+" : ""}
      </p>
      <ul className="flex flex-col gap-2">
        {results.map((stock) => (
          <li key={stock.ticker}>
            <SearchResultCard stock={stock} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {error && <p className="text-xs text-muted-foreground">{error}</p>}
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoading}
            aria-label="검색 결과 더보기"
          >
            {isLoading ? "불러오는 중..." : "더보기"}
          </Button>
        </div>
      )}
    </>
  );
};
