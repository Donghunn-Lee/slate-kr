"use client";

import type { StockSearchResult } from "@/shared/types/stock";
import { SearchResultCard } from "./SearchResultCard";

type SearchResultListProps = {
  results: StockSearchResult[];
};

export const SearchResultList = ({ results }: SearchResultListProps) => {
  return (
    <ul className="flex flex-col gap-2">
      {results.map((stock) => (
        <li key={stock.ticker}>
          <SearchResultCard stock={stock} />
        </li>
      ))}
    </ul>
  );
};
