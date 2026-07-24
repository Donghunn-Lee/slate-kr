import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { searchStocks } from "@/lib/stocks";
import { SearchResultList } from "@/features/search/SearchResultList";
import { SearchBarWithState } from "@/features/search/SearchBarWithState";

const INITIAL_PAGE_SIZE = 20;

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export const generateMetadata = async ({ searchParams }: SearchPageProps): Promise<Metadata> => {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  if (!query) {
    return { title: "검색 — SlateKR" };
  }
  return { title: `"${query}" 검색 결과 — SlateKR` };
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
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (!query) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <SearchHeader query={query} />
        <p className="text-sm text-muted-foreground">검색어를 입력해주세요.</p>
      </main>
    );
  }

  let page: Awaited<ReturnType<typeof searchStocks>>;
  try {
    page = await searchStocks(query, { limit: INITIAL_PAGE_SIZE });
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

  if (page.results.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <SearchHeader query={query} />
        <p className="text-sm text-muted-foreground">
          &ldquo;{query}&rdquo;에 해당하는 종목이 없습니다.
        </p>
      </main>
    );
  }

  if (page.results.length === 1) {
    redirect(`/stocks/${page.results[0].ticker}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <SearchHeader query={query} />
      <SearchResultList
        key={query}
        query={query}
        initialResults={page.results}
        initialHasMore={page.hasMore}
      />
    </main>
  );
}
