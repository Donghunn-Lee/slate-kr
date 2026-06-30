import { TrendingUp, BarChart2, FileText } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";

const CARDS = [
  {
    icon: FileText,
    title: "공시 분류",
    description: "최근 공시를 주요사항·재무·자본 등으로 분류해 태그 표시",
    variant: "sky" as const,
    iconTint: "bg-sky-border text-sky-accent",
  },
  {
    icon: TrendingUp,
    title: "가격 흐름",
    description: "1년 OHLCV 차트와 현재가·등락·거래량·시가총액",
    variant: "lavender" as const,
    iconTint: "bg-lavender-border text-lavender-accent",
  },
  {
    icon: BarChart2,
    title: "핵심 지표",
    description: "PER·PBR·EPS를 현재가 기준으로 실시간 계산",
    variant: "peach" as const,
    iconTint: "bg-peach-border text-peach-accent",
  },
];

export function ServiceValue() {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">무엇을 확인할 수 있나요</h2>
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
        {CARDS.map(({ icon: Icon, title, description, variant, iconTint }) => (
          <StockPanel
            key={title}
            variant={variant}
            className="h-full p-7 transition duration-(--duration-fast) ease-(--ease-smooth) hover:-translate-y-0.5 hover:shadow-slate-hover"
          >
            <span
              className={`inline-flex size-10 items-center justify-center rounded-lg ${iconTint}`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-5 text-sm font-semibold">{title}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
          </StockPanel>
        ))}
      </div>
    </section>
  );
}
