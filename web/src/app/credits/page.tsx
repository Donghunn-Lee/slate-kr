import type { Metadata } from "next";
import Link from "next/link";
import { StockPanel } from "@/entities/stock/StockPanel";

export const metadata: Metadata = {
  title: "데이터 출처·라이선스",
};

const DATA_SOURCES: ReadonlyArray<{ category: string; value: string }> = [
  { category: "시세", value: "한국투자증권 KIS OpenAPI" },
  { category: "지수 과거 데이터", value: "KRX Marketplace" },
  { category: "종목 정보", value: "공공데이터포털(금융위 KRX 상장종목 정보)" },
  { category: "공시·재무", value: "DART(금융감독원 전자공시시스템)" },
  { category: "AI 요약", value: "Google Gemini" },
];

export default function CreditsPage() {
  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-5 sm:space-y-8 sm:py-8">
      <h1 className="text-headline font-bold">데이터 출처·라이선스</h1>

      <section className="space-y-3">
        <h2 className="text-value font-semibold">데이터 출처</h2>
        <StockPanel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
            {DATA_SOURCES.map(({ category, value }) => (
              <div key={category} className="col-span-2 grid grid-cols-subgrid">
                <dt className="font-semibold whitespace-nowrap">{category}</dt>
                <dd className="wrap-anywhere break-keep">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-caption text-muted-foreground">
            종목 시세·분봉은 장중 약 1분 간격으로 갱신됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            국내 종목 일봉은 거래일 20:12 KST에 하루 1회 갱신됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            일봉은 KRX 애프터마켓 마감(20:00) 기준이며, 고가·저가·종가에 애프터마켓 체결이 포함됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            일봉 거래량은 시간외·대량매매를 포함한 누적치로, 네이버 등 일부 차트와 소수 종목에서 차이가 날 수 있습니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            등락률은 전일 정규장(15:30) 종가를 기준가로 계산하며, 증권사·네이버 표기와 같은 기준입니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            지수 시세·분봉은 장중 약 1~2분 간격으로 갱신됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            장외 시간에는 마감 스냅샷 또는 직전 거래일 값을 표시합니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            다우존스(DJI)는 KIS OpenAPI가 장중 시세·분봉을 제공하지 않아 일봉 종가만 표시됩니다.
          </p>
        </StockPanel>
      </section>

      <section className="space-y-3">
        <h2 className="text-value font-semibold">쿠키 사용 안내</h2>
        <StockPanel>
          <p className="text-body">
            관심종목·메모 서버 저장을 위해 익명 식별 쿠키(1년)를 사용합니다.
          </p>
          <p className="mt-2 text-body">
            개인정보는 수집하지 않으며, 쿠키를 삭제하면 서버에 저장된 관심종목·메모와의 연결이 끊깁니다.
          </p>
        </StockPanel>
      </section>

      <section className="space-y-3">
        <h2 className="text-value font-semibold">오픈소스 라이선스</h2>
        <StockPanel>
          <div className="space-y-3">
            <div>
              <h3 className="text-body font-semibold">TradingView Lightweight Charts™</h3>
              <p className="text-caption text-muted-foreground">Apache License 2.0</p>
            </div>
            <div className="rounded border border-subtle bg-elevated p-3 font-mono text-body leading-relaxed">
              <p>TradingView Lightweight Charts™</p>
              <p>
                Copyright (с) 2025 TradingView, Inc.{" "}
                <Link
                  href="https://www.tradingview.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  https://www.tradingview.com/
                </Link>
              </p>
            </div>
            <p className="text-caption text-muted-foreground">
              라이선스 원문:{" "}
              <Link
                href="https://github.com/tradingview/lightweight-charts/blob/master/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                github.com/tradingview/lightweight-charts/LICENSE
              </Link>
            </p>
          </div>
        </StockPanel>
      </section>
    </main>
  );
}
