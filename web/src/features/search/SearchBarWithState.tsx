"use client";

import { useState } from "react";
import { SearchInput } from "./SearchInput";

type SearchBarWithStateProps = {
  initialQuery?: string;
};

export const SearchBarWithState = ({ initialQuery = "" }: SearchBarWithStateProps) => {
  const [value, setValue] = useState(initialQuery);

  return <SearchInput value={value} onChange={setValue} showPreview={false} />;
};
