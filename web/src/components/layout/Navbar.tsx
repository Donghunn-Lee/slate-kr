import Link from "next/link";
import { NavbarSearch } from "@/features/search/NavbarSearch";
import { NavbarMobileSearch } from "@/features/search/NavbarMobileSearch";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto grid h-12 max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          SlateKR
        </Link>
        <div className="hidden justify-self-center md:block md:w-64">
          <NavbarSearch />
        </div>
        <nav className="flex items-center gap-3 text-sm text-muted-foreground md:gap-5">
          <Link
            href="/ranking"
            className="hidden transition-colors hover:text-foreground md:inline"
          >
            시장 순위
          </Link>
          <Link
            href="/watchlist"
            className="hidden transition-colors hover:text-foreground md:inline"
          >
            관심종목
          </Link>
          <a
            href="https://github.com/Donghunn-Lee/slate-kr"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden transition-colors hover:text-foreground md:inline"
          >
            GitHub
          </a>
          <NavbarMobileSearch />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
