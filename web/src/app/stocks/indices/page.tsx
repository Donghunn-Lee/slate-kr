import type { Metadata } from "next";
import {
  DOMESTIC_INDEX_CODES,
  INDEX_CODES,
  INDEX_LABEL,
  type IndexCode,
} from "@/shared/constants/indices";
import { IndicesView } from "@/entities/index/IndicesView";
import { getIndexDailyPrices } from "@/lib/indices";
import { getPriceStats } from "@/lib/prices";
import type { IndexDailySnapshot } from "@/shared/types/quote";
import type { PriceStats } from "@/shared/types/stock";

export const revalidate = 3600;

type PageProps = {
  searchParams: Promise<{ index?: string }>;
};

// ?index= 는 국내·해외 어느 코드든 허용. 미매칭이면 KOSPI 로 fallback.
const resolveIndex = (raw: string | undefined): IndexCode =>
  (INDEX_CODES as readonly string[]).includes(raw ?? "")
    ? (raw as IndexCode)
    : "KOSPI";

export const generateMetadata = async ({ searchParams }: PageProps): Promise<Metadata> => {
  const { index } = await searchParams;
  const selected = resolveIndex(index);
  const label = INDEX_LABEL[selected];
  return {
    title: `${label} 지수 · SlateKR`,
    description: `${label} 지수의 당일/일봉/월봉 차트를 확인하세요.`,
  };
};

export default async function IndicesPage({ searchParams }: PageProps) {
  const { index } = await searchParams;
  const selected = resolveIndex(index);

  // 국내·해외 전 코드의 일봉을 병렬 fetch — per-code try/catch 로 한 코드
  // 실패가 나머지 렌더를 막지 않게 한다.
  // 국내는 기존 KRX collector, 해외는 KIS overseas collector 가 같은
  // index_daily_prices 테이블에 적재하므로 동일 lib 함수로 조회 가능.
  const dailyEntries = await Promise.all(
    INDEX_CODES.map(async (code) => {
      try {
        return [code, await getIndexDailyPrices(code, 1000)] as const;
      } catch {
        return [code, null] as const;
      }
    }),
  );
  const dailyByIndex = Object.fromEntries(dailyEntries) as Record<
    IndexCode,
    IndexDailySnapshot[] | null
  >;

  // stats · 최신 volume 은 이미 fetch 된 dailyByIndex 를 재사용해 SSR 에서 산출.
  // getPriceStats 는 date/high/low/close 만 요구하므로 IndexDailySnapshot 구조적 투입.
  // 최신 EOD volume 은 ASC 배열의 마지막 원소.
  const statsByIndex = Object.fromEntries(
    INDEX_CODES.map((code) => {
      const daily = dailyByIndex[code];
      return [code, daily && daily.length > 0 ? getPriceStats(daily) : null];
    }),
  ) as Record<IndexCode, PriceStats | null>;

  const volumeByIndex = Object.fromEntries(
    INDEX_CODES.map((code) => {
      const daily = dailyByIndex[code];
      const last = daily && daily.length > 0 ? daily[daily.length - 1] : null;
      return [code, last?.volume ?? null];
    }),
  ) as Record<IndexCode, number | null>;

  // resolveIndex 가 해외 코드를 허용하지만 이 스테이지 아코디언은 국내만 렌더한다.
  // 따라서 해외 코드로 진입 시 국내 KOSPI 로 clamp — 아코디언이 자연스럽게 열린 상태로.
  // Stage 4 에서 해외 행이 추가되면 이 clamp 를 제거한다.
  const initialSelected: IndexCode = (
    DOMESTIC_INDEX_CODES as readonly string[]
  ).includes(selected)
    ? selected
    : "KOSPI";

  return (
    <main className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
      <IndicesView
        dailyByIndex={dailyByIndex}
        statsByIndex={statsByIndex}
        volumeByIndex={volumeByIndex}
        initialSelected={initialSelected}
      />
    </main>
  );
}
