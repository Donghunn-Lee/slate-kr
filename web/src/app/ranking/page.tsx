import type { Metadata } from "next";
import { RankingView } from "@/features/market-ranking/RankingView";
import {
  resolveRankingTab,
  type RankingTabDef,
} from "@/features/market-ranking/rankingTabs";
import type { Market } from "@/shared/types/ranking";

type RankingSearchParams = {
  tab?: string;
  market?: string;
};

type RankingPageProps = {
  searchParams: Promise<RankingSearchParams>;
};

const parseMarket = (raw: string | undefined): Market => {
  if (raw === "kospi" || raw === "kosdaq") return raw;
  return "all";
};

const marketLabel = (m: Market): string => {
  if (m === "kospi") return "KOSPI";
  if (m === "kosdaq") return "KOSDAQ";
  return "전체";
};

// metadata 제목 전용: "상승"/"하락" 단독은 어색해 "…률"로 부풀린다. 그 외는 label 그대로.
const titleTerm = (tab: RankingTabDef): string => {
  if (tab.id === "up") return "상승률";
  if (tab.id === "down") return "하락률";
  return tab.label;
};

const buildTitle = (tab: RankingTabDef, m: Market): string => {
  const term = titleTerm(tab);
  return m === "all" ? `${term} 순위` : `${marketLabel(m)} ${term} 순위`;
};

export const generateMetadata = async ({
  searchParams,
}: RankingPageProps): Promise<Metadata> => {
  const params = await searchParams;
  const tab = resolveRankingTab(params.tab);
  const market = parseMarket(params.market);
  return { title: `${buildTitle(tab, market)} — SlateKR` };
};

export default async function RankingPage({ searchParams }: RankingPageProps) {
  const params = await searchParams;
  const tab = resolveRankingTab(params.tab);
  const market = parseMarket(params.market);

  return (
    <main className="container mx-auto max-w-4xl space-y-3 px-4 py-5 sm:space-y-4 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">시장 순위</h1>
      <RankingView initialTabId={tab.id} initialMarket={market} />
    </main>
  );
}
