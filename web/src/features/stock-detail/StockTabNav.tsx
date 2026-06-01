"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type StockTabNavProps = {
  ticker: string;
};

export const StockTabNav = ({ ticker }: StockTabNavProps) => {
  const pathname = usePathname();

  const tabs = [
    { label: "종합정보", href: `/stocks/${ticker}` },
    { label: "차트", href: `/stocks/${ticker}/chart` },
    { label: "재무", href: `/stocks/${ticker}/financials` },
    { label: "공시", href: `/stocks/${ticker}/disclosures` },
  ];

  return (
    <nav className="sticky top-0 z-10 bg-background">
      <div className="flex border-b border-border">
        {tabs.map((tab) => {
          const isActive =
            tab.href === `/stocks/${ticker}`
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              scroll={false}
              data-active={isActive}
              className={cn(
                "px-4 py-3 text-sm transition-colors -mb-px border-b-2",
                isActive
                  ? "text-foreground border-sky-accent"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
