import { TrendingUp, BarChart2, FileText } from "lucide-react";
import type { ComponentType } from "react";
import { StockPanel, type StockPanelVariant } from "@/entities/stock/StockPanel";
import {
  DisclosurePreview,
  MetricsPreview,
  PricePreview,
} from "./ServiceValuePreviews";

type Card = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  variant: StockPanelVariant;
  iconTint: string;
  Preview: ComponentType;
};

const CARDS: Card[] = [
  {
    icon: FileText,
    title: "공시 분류",
    description: "공시를 유형별로 분류하고, 긴 원문은 AI 요약으로 핵심만",
    variant: "sky",
    iconTint: "bg-elevated text-sky-accent",
    Preview: DisclosurePreview,
  },
  {
    icon: TrendingUp,
    title: "가격 흐름",
    description: "실시간 시세와 일봉·분봉 차트, 시장 순위까지",
    variant: "lavender",
    iconTint: "bg-elevated text-lavender-accent",
    Preview: PricePreview,
  },
  {
    icon: BarChart2,
    title: "핵심 지표",
    description: "PER·PBR을 재무제표 원본 기준으로 직접 계산해 제공",
    variant: "peach",
    iconTint: "bg-elevated text-peach-accent",
    Preview: MetricsPreview,
  },
];

export const ServiceValue = () => {
  return (
    <section className="pt-8">
      <h2 className="text-lg font-semibold text-foreground sm:text-xl">
        국내 상장 종목의 가격 · 재무 · 공시를 한 곳에서
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        흩어진 종목 정보를 구조화해 빠르게 조회하는 서비스입니다
      </p>
      <div className="mt-6 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
        {CARDS.map(({ icon: Icon, title, description, variant, iconTint, Preview }) => (
          <StockPanel
            key={title}
            variant={variant}
            className="flex h-full flex-col p-5 transition duration-(--duration-fast) ease-(--ease-smooth) hover:-translate-y-0.5 hover:shadow-slate-hover"
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex size-8 items-center justify-center rounded-lg ${iconTint}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold">{title}</p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
            <div className="mt-4 flex h-16 items-center">
              <Preview />
            </div>
          </StockPanel>
        ))}
      </div>
    </section>
  );
};
