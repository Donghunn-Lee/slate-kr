import { TrendingUp, BarChart2, FileText } from "lucide-react";
import { StockPanel } from "@/entities/stock/StockPanel";

const CARDS = [
  {
    icon: FileText,
    title: "공시 분류",
    description: "최근 공시를 주요사항·재무·자본 등으로 분류해 태그 표시",
    variant: "sky" as const,
  },
  {
    icon: TrendingUp,
    title: "가격 흐름",
    description: "1년 OHLCV 차트와 현재가·등락·거래량·시가총액",
    variant: "lavender" as const,
  },
  {
    icon: BarChart2,
    title: "핵심 지표",
    description: "PER·PBR·EPS를 현재가 기준으로 실시간 계산",
    variant: "peach" as const,
  },
];

export function ServiceValue() {
  return (
    <section className="mb-12">
      <h2 className="mb-3 text-sm font-semibold">무엇을 확인할 수 있나요</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CARDS.map(({ icon: Icon, title, description, variant }) => (
          <StockPanel key={title} variant={variant} className="space-y-3">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </StockPanel>
        ))}
      </div>
    </section>
  );
}
