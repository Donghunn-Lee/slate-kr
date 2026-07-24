import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { searchStocks } from "@/lib/stocks";
import { getLatestPricesByTickers, type LatestPriceSummary } from "@/lib/prices";
import { SearchResultList } from "@/features/search/SearchResultList";
import { SearchBarWithState } from "@/features/search/SearchBarWithState";
import { buttonVariants } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

const PAGE_SIZE = 20;

type SearchPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

const parsePage = (raw: string | undefined): number => {
  if (raw === undefined) return 1;
  if (!/^\d+$/.test(raw)) return 1;
  const n = Number.parseInt(raw, 10);
  return n < 1 ? 1 : n;
};

const buildSearchUrl = (query: string, page: number): string => {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
};

// 현재 ±2 + 첫/끝 + 사이 간격 Ellipsis. 반환은 페이지 번호 또는 "ellipsis" 마커 배열.
type PageToken = number | "ellipsis-left" | "ellipsis-right";

const buildPageTokens = (current: number, total: number): PageToken[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const tokens: PageToken[] = [1];
  const left = Math.max(2, current - 2);
  const right = Math.min(total - 1, current + 2);
  if (left > 2) tokens.push("ellipsis-left");
  for (let i = left; i <= right; i += 1) tokens.push(i);
  if (right < total - 1) tokens.push("ellipsis-right");
  tokens.push(total);
  return tokens;
};

export const generateMetadata = async ({ searchParams }: SearchPageProps): Promise<Metadata> => {
  const { q, page: pageRaw } = await searchParams;
  const query = q?.trim() ?? "";
  const page = parsePage(pageRaw);
  if (!query) {
    return { title: "검색 — SlateKR" };
  }
  const suffix = page > 1 ? ` (${page}페이지)` : "";
  return { title: `"${query}" 검색 결과${suffix} — SlateKR` };
};

const SearchHeader = ({ query }: { query: string }) => (
  <div className="mb-8 flex flex-col gap-4">
    <Link
      href="/"
      className="text-sm font-semibold tracking-tight text-foreground hover:opacity-70 transition-opacity w-fit"
    >
      SlateKR
    </Link>
    <SearchBarWithState initialQuery={query} />
  </div>
);

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, page: pageRaw } = await searchParams;
  const query = q?.trim() ?? "";
  const page = parsePage(pageRaw);

  if (!query) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <SearchHeader query={query} />
        <p className="text-sm text-muted-foreground">검색어를 입력해주세요.</p>
      </main>
    );
  }

  let result: Awaited<ReturnType<typeof searchStocks>>;
  try {
    result = await searchStocks(query, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
  } catch {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <SearchHeader query={query} />
        <p className="text-sm text-muted-foreground">
          검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
      </main>
    );
  }

  // 범위 밖 페이지: total > 0 이지만 현재 offset에 결과 없음 → 1페이지로 복구.
  // searchStocks 는 빈 페이지에서 total=0을 반환하므로 여기서는 rows 비어있고 page>1인 상황으로만 판정.
  if (result.results.length === 0 && page > 1) {
    redirect(buildSearchUrl(query, 1));
  }

  if (result.results.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <SearchHeader query={query} />
        <p className="text-sm text-muted-foreground">
          &ldquo;{query}&rdquo;에 해당하는 종목이 없습니다.
        </p>
      </main>
    );
  }

  // 단일 결과 auto-redirect: 1페이지 && 전체가 1건일 때만 (2페이지 이후 잔여 1건 redirect 방지)
  if (page === 1 && result.total === 1) {
    redirect(`/stocks/${result.results[0].ticker}`);
  }

  const totalPages = Math.ceil(result.total / PAGE_SIZE);
  const pageTokens = buildPageTokens(page, totalPages);

  // 가격 조회 실패는 검색 결과 자체를 죽이지 않는다 — 정적 필드만 남기고 계속.
  let basePrices: Record<string, LatestPriceSummary> = {};
  try {
    basePrices = await getLatestPricesByTickers(result.results.map((r) => r.ticker));
  } catch {
    basePrices = {};
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <SearchHeader query={query} />
      <p className="mb-4 text-xs text-muted-foreground">{result.total}개 종목</p>
      <SearchResultList results={result.results} basePrices={basePrices} />
      {totalPages > 1 && (
        <Pagination className="mt-6">
          <PaginationContent>
            <PaginationItem>
              {page > 1 ? (
                <Link
                  href={buildSearchUrl(query, page - 1)}
                  aria-label="이전 페이지"
                  className={cn(buttonVariants({ variant: "ghost", size: "default" }), "pl-2!")}
                >
                  <ChevronLeftIcon />
                  <span className="hidden sm:block">이전</span>
                </Link>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "default" }),
                    "pl-2! pointer-events-none opacity-40"
                  )}
                >
                  <ChevronLeftIcon />
                  <span className="hidden sm:block">이전</span>
                </span>
              )}
            </PaginationItem>
            {pageTokens.map((token) => (
              <PaginationItem key={token}>
                {token === "ellipsis-left" || token === "ellipsis-right" ? (
                  <PaginationEllipsis />
                ) : token === page ? (
                  <span
                    aria-current="page"
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
                  >
                    {token}
                  </span>
                ) : (
                  <Link
                    href={buildSearchUrl(query, token)}
                    aria-label={`${token}페이지로 이동`}
                    className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                  >
                    {token}
                  </Link>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              {page < totalPages ? (
                <Link
                  href={buildSearchUrl(query, page + 1)}
                  aria-label="다음 페이지"
                  className={cn(buttonVariants({ variant: "ghost", size: "default" }), "pr-2!")}
                >
                  <span className="hidden sm:block">다음</span>
                  <ChevronRightIcon />
                </Link>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "default" }),
                    "pr-2! pointer-events-none opacity-40"
                  )}
                >
                  <span className="hidden sm:block">다음</span>
                  <ChevronRightIcon />
                </span>
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </main>
  );
}
