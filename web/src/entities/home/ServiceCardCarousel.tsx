"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType, ReactNode } from "react";
import { TrendingUp, BarChart2, FileText } from "lucide-react";
import { StockPanel, type StockPanelVariant } from "@/entities/stock/StockPanel";
import { cn } from "@/lib/utils";
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
  Preview: ComponentType<{ play: boolean }>;
};

const CARDS: Card[] = [
  {
    icon: FileText,
    title: "공시 분류",
    description: "공시를 유형별로 분류하고, AI 요약으로 핵심만 빠르게",
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

const AUTO_INTERVAL_MS = 5500;
const SLIDE_WIDTH_CQW = 70;
const CENTER_OFFSET_CQW = (100 - SLIDE_WIDTH_CQW) / 2;

const usePrefersReducedMotion = () => {
  return useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
};

export const ServiceCardCarousel = () => {
  const [active, setActive] = useState(0);
  // 활성 슬라이드가 바뀔 때마다 증가. 같은 슬라이드가 다시 활성화되어도 key 가 달라져서 preview 재마운트 → 재재생.
  const [activationSeq, setActivationSeq] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  const paused = hovered || focused;

  useEffect(() => {
    if (prefersReduced || paused) return;
    const id = window.setTimeout(() => {
      setActivationSeq((s) => s + 1);
      setActive((a) => (a + 1) % CARDS.length);
    }, AUTO_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [prefersReduced, paused, active]);

  const goTo = (i: number) => {
    if (i === active) return;
    setActivationSeq((s) => s + 1);
    setActive(i);
  };

  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setFocused(true);
    }
  };
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setFocused(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-roledescription="carousel"
      className="relative"
    >
      <div className="overflow-hidden [container-type:inline-size]">
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${CENTER_OFFSET_CQW}cqw - ${active} * ${SLIDE_WIDTH_CQW}cqw))`,
            transition: prefersReduced
              ? "none"
              : "transform 500ms var(--ease-smooth)",
          }}
        >
          {CARDS.map((card, i) => {
            const isActive = i === active;
            const Preview = card.Preview;
            return (
              <div
                key={card.title}
                className="shrink-0 px-2"
                style={{ width: `${SLIDE_WIDTH_CQW}cqw` }}
                aria-hidden={!isActive}
              >
                <SlideCard
                  isActive={isActive}
                  onClick={() => goTo(i)}
                  title={card.title}
                >
                  <StockPanel
                    variant={card.variant}
                    className="flex h-full flex-col p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex size-8 items-center justify-center rounded-lg ${card.iconTint}`}
                      >
                        <card.icon className="h-4 w-4" />
                      </span>
                      <p className="text-sm font-semibold">{card.title}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {card.description}
                    </p>
                    <div className="mt-4 flex h-16 items-center">
                      <Preview
                        key={isActive ? `play-${activationSeq}` : "idle"}
                        play={isActive}
                      />
                    </div>
                  </StockPanel>
                </SlideCard>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        {CARDS.map((card, i) => {
          const isActive = i === active;
          return (
            <button
              key={card.title}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${card.title} 슬라이드`}
              aria-current={isActive}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300 ease-out",
                isActive ? "w-6 bg-foreground" : "w-1.5 bg-foreground/30 hover:bg-foreground/50",
              )}
            />
          );
        })}
      </div>
    </div>
  );
};

type SlideCardProps = {
  isActive: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
};

// 활성 카드는 정적 컨테이너, 비활성 카드는 클릭 시 goTo. tabIndex=-1 로 키보드 tab 순회 제외
// (도트 버튼이 유일한 키보드 진입점).
const SlideCard = ({ isActive, onClick, title, children }: SlideCardProps) => {
  const baseTransition =
    "block w-full text-left transition-all duration-300 ease-out";
  if (isActive) {
    return (
      <div className={cn(baseTransition, "scale-100 opacity-100")}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${title} 슬라이드로 이동`}
      tabIndex={-1}
      className={cn(
        baseTransition,
        "scale-95 cursor-pointer opacity-60 hover:opacity-80",
      )}
    >
      {children}
    </button>
  );
};
