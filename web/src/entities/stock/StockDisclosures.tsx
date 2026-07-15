import type { DartDisclosure } from "@/shared/types/stock";
import { getCorpCode } from "@/lib/stocks";
import { getDisclosures } from "@/lib/dart";
import { resolveDateRange } from "@/features/disclosure/resolveDateRange";
import type { DisclosureFilterType, PeriodPreset } from "@/features/disclosure/types";
import { classifyDisclosure } from "@/shared/utils/classifyDisclosure";
import { DisclosuresSection } from "./DisclosuresSection";

const PAGE_SIZE = 10;
const DART_PAGE_COUNT = 100;

type StockDisclosuresProps = {
  ticker: string;
  preset: PeriodPreset;
  bgnDate?: string;
  endDate?: string;
  query: string;
  types: DisclosureFilterType[];
  page: number;
};

type FetchResult = {
  items: DartDisclosure[];
  totalCount: number;
  totalPage: number;
};

const fetchUnfiltered = async (
  corpCode: string,
  page: number,
  bgnDate: Date | undefined,
  endDate: Date | undefined,
): Promise<FetchResult> => {
  const dartPage = Math.ceil(page / (DART_PAGE_COUNT / PAGE_SIZE));
  const result = await getDisclosures(corpCode, {
    pageNo: dartPage,
    pageCount: DART_PAGE_COUNT,
    bgnDate,
    endDate,
  });
  const sliceStart = ((page - 1) % (DART_PAGE_COUNT / PAGE_SIZE)) * PAGE_SIZE;
  const items = result.items.slice(sliceStart, sliceStart + PAGE_SIZE);
  return {
    items,
    totalCount: result.totalCount,
    totalPage: Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)),
  };
};

const fetchFiltered = async (
  corpCode: string,
  query: string,
  types: DisclosureFilterType[],
  page: number,
  bgnDate: Date | undefined,
  endDate: Date | undefined,
): Promise<FetchResult> => {
  const first = await getDisclosures(corpCode, {
    pageNo: 1,
    pageCount: DART_PAGE_COUNT,
    bgnDate,
    endDate,
  });
  const allItems: DartDisclosure[] = [...first.items];

  if (first.totalPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: first.totalPage - 1 }, (_, i) =>
        getDisclosures(corpCode, {
          pageNo: i + 2,
          pageCount: DART_PAGE_COUNT,
          bgnDate,
          endDate,
        }),
      ),
    );
    rest.forEach((r) => allItems.push(...r.items));
  }

  const needle = query.toLowerCase();
  const typeSet = new Set(types);
  const filtered = allItems.filter((d) => {
    if (query !== "" && !d.disclosureNm.toLowerCase().includes(needle)) return false;
    if (typeSet.size > 0) {
      const t = classifyDisclosure(d.disclosureNm, d.flrNm);
      if (t === null) {
        if (!typeSet.has("UNCATEGORIZED")) return false;
      } else if (!typeSet.has(t)) {
        return false;
      }
    }
    return true;
  });
  const sliceStart = (page - 1) * PAGE_SIZE;
  return {
    items: filtered.slice(sliceStart, sliceStart + PAGE_SIZE),
    totalCount: filtered.length,
    totalPage: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  };
};

export const StockDisclosures = async ({
  ticker,
  preset,
  bgnDate,
  endDate,
  query,
  types,
  page,
}: StockDisclosuresProps) => {
  let items: DartDisclosure[] = [];
  let totalCount = 0;
  let totalPage = 0;
  let noApiKey = false;
  let hasError = false;

  try {
    if (!process.env.DART_API_KEY) {
      noApiKey = true;
    } else {
      const corpCode = await getCorpCode(ticker);
      if (corpCode) {
        const { bgnDate: bgn, endDate: end } = resolveDateRange(
          preset,
          bgnDate,
          endDate,
        );
        const needsMerge = query !== "" || types.length > 0;
        const result = needsMerge
          ? await fetchFiltered(corpCode, query, types, page, bgn, end)
          : await fetchUnfiltered(corpCode, page, bgn, end);
        items = result.items;
        totalCount = result.totalCount;
        totalPage = result.totalPage;
      }
    }
  } catch {
    hasError = true;
  }

  return (
    <DisclosuresSection
      ticker={ticker}
      disclosures={items}
      totalCount={totalCount}
      totalPage={totalPage}
      currentPage={page}
      preset={preset}
      bgnDate={bgnDate}
      endDate={endDate}
      query={query}
      types={types}
      noApiKey={noApiKey}
      hasError={hasError}
    />
  );
};
