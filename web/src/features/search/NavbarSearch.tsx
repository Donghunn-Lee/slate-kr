"use client";

import { useState } from "react";
import { SearchInput } from "./SearchInput";

type NavbarSearchProps = {
  autoFocus?: boolean;
  onNavigate?: () => void;
};

export const NavbarSearch = ({ autoFocus, onNavigate }: NavbarSearchProps = {}) => {
  const [value, setValue] = useState("");

  return (
    <SearchInput
      value={value}
      onChange={setValue}
      size="sm"
      showButton={false}
      placeholder="종목 검색"
      autoFocus={autoFocus}
      onNavigate={onNavigate}
    />
  );
};
