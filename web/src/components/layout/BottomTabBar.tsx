"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LineChart, Star, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type TabDef = {
  href: string;
  label: string;
  Icon: LucideIcon;
  match: (pathname: string) => boolean;
};

const TABS = [
  { href: "/", label: "홈", Icon: Home, match: (p) => p === "/" },
  { href: "/ranking", label: "순위", Icon: TrendingUp, match: (p) => p.startsWith("/ranking") },
  { href: "/watchlist", label: "관심", Icon: Star, match: (p) => p.startsWith("/watchlist") },
  {
    href: "/stocks/indices",
    label: "지수",
    Icon: LineChart,
    match: (p) => p.startsWith("/stocks/indices"),
  },
] as const satisfies readonly TabDef[];

export const BottomTabBar = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-5xl items-stretch">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.Icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 transition-colors",
                  active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-caption">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
