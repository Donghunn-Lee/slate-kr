import { StockPanel, type StockPanelVariant } from "@/entities/stock/StockPanel";

type PanelVariant = {
  name: string;
  variant: StockPanelVariant;
  bgToken: string;
  borderToken: string;
  dot: string;
  codeBg: string;
  label: string;
};

const VARIANTS: PanelVariant[] = [
  {
    name: "Plain",
    variant: "plain",
    bgToken: "--bg-elevated",
    borderToken: "--border-subtle",
    dot: "bg-muted",
    codeBg: "bg-subtle",
    label: "기본 패널 — 관심종목·무채색 섹션",
  },
  {
    name: "Sky",
    variant: "sky",
    bgToken: "--sky-bg",
    borderToken: "--sky-border",
    dot: "bg-sky-accent",
    codeBg: "bg-sky-border",
    label: "하늘색 강조 — 공시 섹션",
  },
  {
    name: "Sage",
    variant: "sage",
    bgToken: "--sage-bg",
    borderToken: "--sage-border",
    dot: "bg-sage-accent",
    codeBg: "bg-sage-border",
    label: "민트/세이지 — 가격 통계 섹션",
  },
  {
    name: "Amber",
    variant: "amber",
    bgToken: "--amber-bg",
    borderToken: "--amber-border",
    dot: "bg-amber-accent",
    codeBg: "bg-amber-border",
    label: "앰버 — 재무 요약 섹션",
  },
  {
    name: "Lavender",
    variant: "lavender",
    bgToken: "--lavender-bg",
    borderToken: "--lavender-border",
    dot: "bg-lavender-accent",
    codeBg: "bg-lavender-border",
    label: "라벤더 — 차트 섹션",
  },
  {
    name: "Peach",
    variant: "peach",
    bgToken: "--peach-bg",
    borderToken: "--peach-border",
    dot: "bg-peach-accent",
    codeBg: "bg-peach-border",
    label: "피치 — 핵심 지표 섹션",
  },
];

export const SlatePanels = () => (
  <section>
    <h2 className="mb-2 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Slate Panels
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      StockPanel variant 6종 — 동일 구조에서 배경·테두리 색만 교체. noBorder로 테두리 생략
    </p>

    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      {VARIANTS.map(({ name, variant, bgToken, borderToken, dot, codeBg, label }) => (
        <StockPanel key={name} variant={variant}>
          <div className="mb-2 flex items-center gap-2">
            <div className={`size-2 shrink-0 rounded-full ${dot}`} />
            <p className="text-sm font-semibold text-foreground">패널 제목 — {name}</p>
          </div>
          <p className="text-xs leading-normal text-muted-foreground">{label}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <code
              className={`rounded font-mono text-[10px] text-muted-foreground ${codeBg} px-1.5 py-0.5`}
            >
              bg: {bgToken}
            </code>
            <code
              className={`rounded font-mono text-[10px] text-muted-foreground ${codeBg} px-1.5 py-0.5`}
            >
              border: {borderToken}
            </code>
          </div>
        </StockPanel>
      ))}
    </div>
  </section>
);
