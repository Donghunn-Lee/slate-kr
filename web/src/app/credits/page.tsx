import type { Metadata } from "next";
import Link from "next/link";
import { StockPanel } from "@/entities/stock/StockPanel";
import { cn } from "@/lib/utils";
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL } from "@/shared/constants/gemini";

export const metadata: Metadata = {
  title: "데이터 출처·라이선스",
  description:
    "SlateKR의 데이터 출처·갱신 주기·알려진 한계와 쿠키 사용, 오픈소스 라이선스를 안내합니다.",
};

type CategoryRow = { category: string; value: string };

const DEMO_DATA_SCOPE: ReadonlyArray<CategoryRow> = [
  { category: "가상 데이터", value: "현재가 · 차트(분봉 · 일봉) · 지수 · 순위 · 관심 등록 수" },
  { category: "DART 실데이터", value: "종목 목록 · 상장주식수 · 재무제표 · 배당 · 공시" },
];

const DATA_SOURCES: ReadonlyArray<CategoryRow> = [
  { category: "시세 · 지수 · 순위", value: "가상 데이터(자체 생성기)" },
  { category: "종목 목록", value: "DART 고유번호 · 기업개황" },
  { category: "상장주식수", value: "DART 주식총수 현황" },
  { category: "공시 · 재무 · 배당", value: "DART(금융감독원 전자공시시스템)" },
  {
    category: "AI 요약",
    value: `Google Gemini(${GEMINI_MODEL} · 장애 시 ${GEMINI_FALLBACK_MODEL})`,
  },
];

type CategoryListProps = {
  rows: ReadonlyArray<CategoryRow>;
  className?: string;
};

const CategoryList = ({ rows, className }: CategoryListProps) => (
  <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body", className)}>
    {rows.map(({ category, value }) => (
      <div key={category} className="col-span-2 grid grid-cols-subgrid">
        <dt className="font-semibold whitespace-nowrap">{category}</dt>
        <dd className="wrap-anywhere break-keep">{value}</dd>
      </div>
    ))}
  </dl>
);

export default function CreditsPage() {
  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-5 sm:space-y-8 sm:py-8">
      <h1 className="text-headline font-bold">데이터 출처·라이선스</h1>

      {/* 배너 · 첫 방문 안내의 /credits#demo 링크가 닿는 곳 — sticky 헤더(2행)에 제목이 가리지 않게 띄운다. */}
      <section id="demo" className="scroll-mt-24 space-y-3">
        <h2 className="text-value font-semibold">가상 데이터 안내</h2>
        <StockPanel className="break-keep">
          <p className="text-body">
            국내 시세는 거래소와의 정보 이용 계약 없이 불특정 다수에게 제공할 수 없습니다. 증권사
            API · 공공데이터도 같은 조건이라, 공개 데모의 가격 계열은 가상 데이터로 대체했습니다.
          </p>
          <CategoryList rows={DEMO_DATA_SCOPE} className="mt-3" />
          <p className="mt-3 text-caption text-muted-foreground">
            가상 시세는 같은 종목 · 같은 시각이면 언제 다시 봐도 같은 값이 나오도록 생성합니다.
            가격대는 DART 배당 · 재무로 정한 기준점에 맞추고, 지수와 종목은 같은 시장 흐름을
            공유하며, 동시호가 · 프리마켓 · 애프터마켓 같은 장 운영 규칙을 따릅니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            PER · PBR · 시가배당률은 가상 시세로 계산하므로 실제 값과 다릅니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            화면 상단 &lsquo;데모 설정&rsquo;에서 가격 API에 지연(3초)이나 실패 응답을 주입해 섹션별
            로딩 · 실패 화면을 볼 수 있습니다.
          </p>
        </StockPanel>
      </section>

      <section className="space-y-3">
        <h2 className="text-value font-semibold">데이터 출처</h2>
        <StockPanel>
          <CategoryList rows={DATA_SOURCES} />
          <p className="mt-3 text-caption text-muted-foreground">
            종목 시세·분봉은 장중 약 1분 간격으로 갱신됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            국내 종목 일봉은 거래일 20:10 KST에 하루 1회 갱신됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            일봉은 KRX 애프터마켓 마감(20:00) 기준이며, 고가·저가·종가에 애프터마켓 체결이
            포함됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            등락률은 전일 정규장(15:30) 종가를 기준가로 계산하며, 증권사·네이버 표기와 같은
            기준입니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            PER·EPS·시가배당률은 DART 공시 값과 가상 일봉 종가로 계산합니다. 주식 병합·분할·무상증자
            등으로 주식수가 바뀐 종목은 공시 EPS의 기준 주식수가 현재와 달라 값이 어긋날 수
            있습니다. 차이가 크게 감지되면 표시하지 않지만, 변동 폭이 작거나 최근에 발생한 경우에는
            감지되지 않아 다른 서비스와 다른 값이 표시될 수 있습니다. 12월 결산이 아닌 종목은 분기
            기준 값이 정확하지 않을 수 있습니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            지수 시세·분봉은 장중 약 1~2분 간격으로 갱신됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            장외 시간에는 마감 스냅샷 또는 직전 거래일 값을 표시합니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            다우존스(DJI)는 장중 시세 · 분봉 없이 일봉 종가만 표시됩니다.
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            순위는 장중 약 1분 간격으로 갱신되며, 거래일 06:00~09:00 KST에는 NXT(NXT 거래 종목만),
            그 외 시간에는 KRX 기준으로 집계합니다.
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
            개인정보는 수집하지 않으며, 쿠키를 삭제하면 서버에 저장된 관심종목·메모와의 연결이
            끊깁니다.
          </p>
          <p className="mt-2 text-body">장애 시뮬레이션을 켜면 설정 쿠키(1시간)를 사용합니다.</p>
          <p className="mt-2 text-body">
            첫 방문 안내를 닫으면 다시 표시하지 않도록 브라우저 저장소에 기록합니다.
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
            <div className="rounded border border-subtle bg-elevated p-3 font-mono text-body/relaxed">
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
