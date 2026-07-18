"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ThemeToggle = () => {
  // resolvedTheme 은 SSR/첫 렌더에 undefined — 마운트 이후에만 아이콘 스왑해 hydration mismatch 방지.
  // 프로젝트 컨벤션(WatchlistPreview·WatchlistButton) 과 동일한 useSyncExternalStore 마운트 가드.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme } = useTheme();

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-label="테마 전환" disabled />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Moon /> : <Sun />}
    </Button>
  );
};
