import type { Metadata } from "next";
import { RankingView } from "@/features/market-ranking/RankingView";
import type { Market, MarketRankingKind } from "@/shared/types/ranking";

type RankingSearchParams = {
  kind?: string;
  direction?: string;
  by?: string;
  market?: string;
};

type RankingPageProps = {
  searchParams: Promise<RankingSearchParams>;
};

const parseMarket = (raw: string | undefined): Market => {
  if (raw === "kospi" || raw === "kosdaq") return raw;
  return "all";
};

// 유효하지 않으면 기본값 폴백. throw 하지 않는다 — 잘못된 URL 로 페이지가 죽으면 안 된다.
const parseKind = (params: RankingSearchParams): MarketRankingKind => {
  const market = parseMarket(params.market);
  if (params.kind === "volume") {
    const by = params.by === "value" ? "value" : "volume";
    return { kind: "volume", by, market };
  }
  const direction = params.direction === "down" ? "down" : "up";
  return { kind: "fluctuation", direction, market };
};

const kindLabel = (k: MarketRankingKind): string => {
  if (k.kind === "fluctuation") {
    return k.direction === "up" ? "상승률 순위" : "하락률 순위";
  }
  return k.by === "value" ? "거래대금 순위" : "거래량 순위";
};

const marketLabel = (m: Market): string => {
  if (m === "kospi") return "KOSPI";
  if (m === "kosdaq") return "KOSDAQ";
  return "전체";
};

const buildTitle = (k: MarketRankingKind): string => {
  const base = kindLabel(k);
  return k.market === "all" ? base : `${marketLabel(k.market)} ${base}`;
};

export const generateMetadata = async ({
  searchParams,
}: RankingPageProps): Promise<Metadata> => {
  const params = await searchParams;
  const kind = parseKind(params);
  return { title: `${buildTitle(kind)} — SlateKR` };
};

export default async function RankingPage({ searchParams }: RankingPageProps) {
  const params = await searchParams;
  const initialKind = parseKind(params);

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">시장 순위</h1>
      <RankingView initialKind={initialKind} />
    </main>
  );
}
