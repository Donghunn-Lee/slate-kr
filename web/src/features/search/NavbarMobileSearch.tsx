"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavbarSearch } from "./NavbarSearch";

// pathname 변경 시 자동 닫힘을 effect+setState 없이 파생 상태로 처리.
// openedAt 에 열었던 순간의 pathname 을 저장하고, 현재 pathname 과 다르면 닫힌 것으로 본다.
export const NavbarMobileSearch = () => {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;

  const close = () => setOpenedAt(null);
  const toggle = () => setOpenedAt(open ? null : pathname);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label={open ? "종목 검색 닫기" : "종목 검색 열기"}
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? <X /> : <Search />}
      </Button>
      {open && (
        <div className="absolute inset-x-0 top-full border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur-sm md:hidden">
          <NavbarSearch autoFocus onNavigate={close} />
        </div>
      )}
    </>
  );
};
