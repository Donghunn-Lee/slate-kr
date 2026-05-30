import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PeriodPreset } from "./types";

type DisclosurePaginationProps = {
  ticker: string;
  currentPage: number;
  totalPage: number;
  preset: PeriodPreset;
  bgnDate?: string;
  endDate?: string;
  query: string;
};

const buildHref = (
  ticker: string,
  page: number,
  preset: PeriodPreset,
  bgnDate: string | undefined,
  endDate: string | undefined,
  query: string,
): string => {
  const sp = new URLSearchParams();
  sp.set("preset", preset);
  if (preset === "CUSTOM") {
    if (bgnDate) sp.set("bgn", bgnDate);
    if (endDate) sp.set("end", endDate);
  }
  if (query) sp.set("q", query);
  sp.set("page", String(page));
  return `/stocks/${ticker}/disclosures?${sp.toString()}`;
};

const buildPageList = (current: number, total: number): (number | "...")[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
};

export const DisclosurePagination = ({
  ticker,
  currentPage,
  totalPage,
  preset,
  bgnDate,
  endDate,
  query,
}: DisclosurePaginationProps) => {
  if (totalPage <= 1) return null;

  const pages = buildPageList(currentPage, totalPage);
  const href = (page: number) =>
    buildHref(ticker, page, preset, bgnDate, endDate, query);

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPage;

  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className="mt-4 flex w-full justify-center"
    >
      <ul className="flex items-center gap-1">
        <li>
          {hasPrev ? (
            <Button asChild variant="ghost" size="sm">
              <Link
                href={href(currentPage - 1)}
                scroll={false}
                prefetch={false}
                aria-label="이전 페이지"
              >
                <ChevronLeftIcon data-icon="inline-start" />
                <span className="hidden sm:inline">이전</span>
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              aria-label="이전 페이지"
            >
              <ChevronLeftIcon data-icon="inline-start" />
              <span className="hidden sm:inline">이전</span>
            </Button>
          )}
        </li>

        {pages.map((p, idx) =>
          p === "..." ? (
            <li key={`ellipsis-${idx}`}>
              <span
                aria-hidden
                className="flex size-9 items-center justify-center text-muted-foreground"
              >
                <MoreHorizontalIcon className="size-4" />
                <span className="sr-only">더 많은 페이지</span>
              </span>
            </li>
          ) : (
            <li key={p}>
              <Button
                asChild
                variant={p === currentPage ? "outline" : "ghost"}
                size="icon"
                className={cn(p === currentPage && "pointer-events-none")}
              >
                <Link
                  href={href(p)}
                  scroll={false}
                  prefetch={false}
                  aria-current={p === currentPage ? "page" : undefined}
                >
                  {p}
                </Link>
              </Button>
            </li>
          ),
        )}

        <li>
          {hasNext ? (
            <Button asChild variant="ghost" size="sm">
              <Link
                href={href(currentPage + 1)}
                scroll={false}
                prefetch={false}
                aria-label="다음 페이지"
              >
                <span className="hidden sm:inline">다음</span>
                <ChevronRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              aria-label="다음 페이지"
            >
              <span className="hidden sm:inline">다음</span>
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          )}
        </li>
      </ul>
    </nav>
  );
};
