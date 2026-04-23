import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { searchStocks } from "@/lib/stocks";
import { SearchResultCard } from "@/features/search/SearchResultCard";

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

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (!query) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16">
        <p className="text-center text-sm text-muted-foreground">검색어를 입력해주세요.</p>
      </main>
    );
  }

  let results: Awaited<ReturnType<typeof searchStocks>>;
  try {
    results = await searchStocks(query);
  } catch {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16">
        <p className="text-center text-sm text-muted-foreground">
          검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
      </main>
    );
  }

  if (results.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16">
        <p className="text-center text-sm text-muted-foreground">
          &ldquo;{query}&rdquo;에 해당하는 종목이 없습니다.
        </p>
      </main>
    );
  }

  if (results.length === 1) {
    redirect(`/stocks/${results[0].ticker}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-lg font-semibold tracking-tight">&ldquo;{query}&rdquo; 검색 결과</h1>
      <p className="mb-6 text-xs text-muted-foreground">{results.length}개 종목</p>
      <ul className="flex flex-col gap-2">
        {results.map((stock) => (
          <li key={stock.ticker}>
            <SearchResultCard stock={stock} />
          </li>
        ))}
      </ul>
    </main>
  );
}
