import Link from "next/link";
import type { StockSummary } from "@/shared/types/stock";

type SearchResultCardProps = {
  stock: Pick<StockSummary, "ticker" | "name" | "market">;
};

export const SearchResultCard = ({ stock }: SearchResultCardProps) => {
  return (
    <Link href={`/stocks/${stock.ticker}`}>
      <div className="rounded-xl bg-elevated border border-subtle px-4 py-3 transition-colors hover:bg-muted hover:border-default">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{stock.name}</span>
            <span className="font-mono text-xs text-muted-foreground shrink-0">{stock.ticker}</span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{stock.market}</span>
        </div>
      </div>
    </Link>
  );
};
