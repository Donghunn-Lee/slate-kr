"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SearchInput } from "./SearchInput";

type NavbarSearchProps = {
  autoFocus?: boolean;
  onNavigate?: () => void;
};

export const NavbarSearch = ({ autoFocus, onNavigate }: NavbarSearchProps = {}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // /search 라우트에서만 URL q 를 SoT 로 사용. 다른 라우트로 이동 시 로컬 값 유지(강제 초기화 없음).
  const urlQuery = pathname === "/search" ? (searchParams.get("q") ?? "") : null;

  const [value, setValue] = useState(urlQuery ?? "");
  // 렌더 시점 prop-sync 패턴 — useEffect 없이 URL q 변화(같은 /search 내 재검색, 뒤로/앞으로)에 동기화.
  const [prevUrlQuery, setPrevUrlQuery] = useState<string | null>(urlQuery);
  if (prevUrlQuery !== urlQuery) {
    setPrevUrlQuery(urlQuery);
    if (urlQuery !== null) setValue(urlQuery);
  }

  return (
    <SearchInput
      value={value}
      onChange={setValue}
      size="sm"
      placeholder="종목 검색"
      autoFocus={autoFocus}
      onNavigate={onNavigate}
    />
  );
};
