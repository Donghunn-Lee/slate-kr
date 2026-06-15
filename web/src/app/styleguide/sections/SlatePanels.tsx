type PanelVariant = {
  name: string;
  bg: string;
  border: string;
  dot: string;
  codeBg: string;
  label: string;
};

const VARIANTS: PanelVariant[] = [
  {
    name: "Plain",
    bg: "bg-elevated",
    border: "border-subtle",
    dot: "bg-muted",
    codeBg: "bg-subtle",
    label: "기본 패널 — 관심종목·무채색 섹션",
  },
  {
    name: "Sky",
    bg: "bg-sky-bg",
    border: "border-sky-border",
    dot: "bg-sky-accent",
    codeBg: "bg-sky-border",
    label: "하늘색 강조 — 공시 섹션",
  },
  {
    name: "Sage",
    bg: "bg-sage-bg",
    border: "border-sage-border",
    dot: "bg-sage-accent",
    codeBg: "bg-sage-border",
    label: "민트/세이지 — 가격 통계 섹션",
  },
  {
    name: "Amber",
    bg: "bg-amber-bg",
    border: "border-amber-border",
    dot: "bg-amber-accent",
    codeBg: "bg-amber-border",
    label: "앰버 — 재무 요약 섹션",
  },
  {
    name: "Lavender",
    bg: "bg-lavender-bg",
    border: "border-lavender-border",
    dot: "bg-lavender-accent",
    codeBg: "bg-lavender-border",
    label: "라벤더 — AI 요약·분석 섹션",
  },
  {
    name: "Peach",
    bg: "bg-peach-bg",
    border: "border-peach-border",
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
      6종 패널 변형 — 동일 구조에서 배경·테두리 색만 교체
    </p>

    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      {VARIANTS.map(({ name, bg, border, dot, codeBg, label }) => (
        <div
          key={name}
          className={`${bg} border ${border} rounded-lg p-6`}
          style={{ boxShadow: "var(--shadow-slate)" }}
        >
          <div className="mb-2 flex items-center gap-2">
            <div className={`size-2 shrink-0 rounded-full ${dot}`} />
            <p className="text-sm font-semibold text-foreground">패널 제목 — {name}</p>
          </div>
          <p className="text-xs leading-normal text-muted-foreground">{label}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <code
              className={`rounded font-mono text-[10px] text-muted-foreground ${codeBg} px-1.5 py-0.5`}
            >
              bg: --{name.toLowerCase()}-bg
            </code>
            <code
              className={`rounded font-mono text-[10px] text-muted-foreground ${codeBg} px-1.5 py-0.5`}
            >
              border: --{name.toLowerCase()}-border
            </code>
          </div>
        </div>
      ))}
    </div>
  </section>
);
