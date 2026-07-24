"use client";

import { useState } from "react";
import { SearchInput } from "./SearchInput";

export const NavbarSearch = () => {
  const [value, setValue] = useState("");

  return (
    <SearchInput
      value={value}
      onChange={setValue}
      size="sm"
      showButton={false}
      placeholder="종목 검색"
    />
  );
};
