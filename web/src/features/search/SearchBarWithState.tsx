"use client";

import { useState } from "react";
import { useRecentSearchesStore } from "./useRecentSearchesStore";
import { SearchInput } from "./SearchInput";

type SearchBarWithStateProps = {
  initialQuery?: string;
};

export const SearchBarWithState = ({ initialQuery = "" }: SearchBarWithStateProps) => {
  const [value, setValue] = useState(initialQuery);
  const addRecent = useRecentSearchesStore((s) => s.add);

  const handleSelect = (ticker: string, name: string) => {
    addRecent(ticker, name);
  };

  return <SearchInput value={value} onChange={setValue} onSelect={handleSelect} />;
};
