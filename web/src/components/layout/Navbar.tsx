import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          SlateKR
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/ranking" className="transition-colors hover:text-foreground">
            시장 순위
          </Link>
          <Link href="/watchlist" className="transition-colors hover:text-foreground">
            관심종목
          </Link>
          <a
            href="https://github.com/Donghunn-Lee/slate-kr"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
