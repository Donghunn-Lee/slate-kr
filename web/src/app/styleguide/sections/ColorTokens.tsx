type SwatchGroupProps = {
  title: string;
  tokens: { token: string; value: string; label?: string }[];
};

const SwatchGroup = ({ title, tokens }: SwatchGroupProps) => (
  <div>
    <h3 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {title}
    </h3>
    <div
      className="grid gap-2.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
    >
      {tokens.map(({ token, value, label }) => (
        <div
          key={token}
          className="flex items-center gap-2.5 rounded-sm border border-subtle bg-elevated p-2"
        >
          <div
            className="h-9 w-9 shrink-0 rounded-sm"
            style={{
              backgroundColor: `var(${token})`,
              border: "1px solid oklch(0.85 0.005 85 / 60%)",
            }}
          />
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] font-semibold text-foreground">{token}</p>
            <p className="mt-px font-mono text-[10px] text-muted-foreground">{value}</p>
            {label && <p className="mt-px text-[10px] text-muted-foreground">{label}</p>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ACCENT_COLORS = [
  { name: "Sky", prefix: "sky", hue: 220 },
  { name: "Sage", prefix: "sage", hue: 165 },
  { name: "Amber", prefix: "amber", hue: 80 },
  { name: "Lavender", prefix: "lavender", hue: 290 },
  { name: "Peach", prefix: "peach", hue: 35 },
];

export const ColorTokens = () => (
  <section>
    <h2 className="mb-6 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Color Tokens
    </h2>

    <div className="flex flex-col gap-8">
      <SwatchGroup
        title="Base"
        tokens={[
          { token: "--bg-base", value: "oklch(0.98 0.005 85)", label: "페이지 배경" },
          { token: "--bg-elevated", value: "oklch(0.995 0.003 85)", label: "패널·카드 배경" },
          { token: "--text-primary", value: "oklch(0.25 0.02 270)", label: "본문 텍스트" },
          { token: "--text-secondary", value: "oklch(0.34 0.015 270)", label: "보조 텍스트" },
          { token: "--text-tertiary", value: "oklch(0.65 0.01 270)", label: "캡션·레이블" },
          { token: "--border-subtle", value: "oklch(0.92 0.005 85)", label: "구분선" },
          { token: "--border-default", value: "oklch(0.88 0.008 85)", label: "컴포넌트 테두리" },
        ]}
      />

      <SwatchGroup
        title="Functional — 등락 (상승 Red / 하락 Blue)"
        tokens={[
          { token: "--price-up", value: "oklch(0.52 0.2 25)", label: "상승" },
          { token: "--price-up-muted", value: "oklch(0.52 0.2 25 / 12%)", label: "상승 배경" },
          { token: "--price-down", value: "oklch(0.48 0.18 260)", label: "하락" },
          { token: "--price-down-muted", value: "oklch(0.48 0.18 260 / 12%)", label: "하락 배경" },
          { token: "--price-neutral", value: "oklch(0.55 0.01 270)", label: "보합" },
        ]}
      />

      {ACCENT_COLORS.map(({ name, prefix }) => (
        <SwatchGroup
          key={prefix}
          title={`Accent — ${name}`}
          tokens={[
            { token: `--${prefix}-bg`, value: `(hue ${prefix})`, label: "배경" },
            { token: `--${prefix}-border`, value: `(hue ${prefix})`, label: "테두리" },
            { token: `--${prefix}-accent`, value: `(hue ${prefix})`, label: "아이콘·강조" },
          ]}
        />
      ))}

      <SwatchGroup
        title="Disclosure — 공시 카테고리 (5종 × bg/text)"
        tokens={[
          {
            token: "--disclosure-major-event-bg",
            value: "oklch(0.96 0.04 25)",
            label: "주요사항 배경",
          },
          {
            token: "--disclosure-major-event-text",
            value: "oklch(0.50 0.20 25)",
            label: "주요사항 텍스트",
          },
          {
            token: "--disclosure-financial-bg",
            value: "oklch(0.96 0.03 260)",
            label: "정기보고서 배경",
          },
          {
            token: "--disclosure-financial-text",
            value: "oklch(0.48 0.18 260)",
            label: "정기보고서 텍스트",
          },
          {
            token: "--disclosure-ownership-bg",
            value: "oklch(0.96 0.04 305)",
            label: "소유상황 배경",
          },
          {
            token: "--disclosure-ownership-text",
            value: "oklch(0.50 0.17 305)",
            label: "소유상황 텍스트",
          },
          { token: "--disclosure-audit-bg", value: "oklch(0.96 0.04 185)", label: "감사 배경" },
          { token: "--disclosure-audit-text", value: "oklch(0.50 0.14 185)", label: "감사 텍스트" },
          {
            token: "--disclosure-shareholder-meeting-bg",
            value: "oklch(0.97 0.05 80)",
            label: "주주총회 배경",
          },
          {
            token: "--disclosure-shareholder-meeting-text",
            value: "oklch(0.60 0.15 60)",
            label: "주주총회 텍스트",
          },
        ]}
      />

      <SwatchGroup
        title="shadcn/ui — Semantic"
        tokens={[
          { token: "--background", value: "→ bg-base", label: "body 배경" },
          { token: "--foreground", value: "→ text-primary", label: "body 텍스트" },
          { token: "--card", value: "→ bg-elevated", label: "카드" },
          { token: "--border", value: "→ border-default", label: "기본 테두리" },
          { token: "--muted", value: "oklch(0.94 0.006 85)", label: "muted 배경" },
          { token: "--muted-foreground", value: "→ text-secondary", label: "muted 텍스트" },
          { token: "--primary", value: "oklch(0.25 0.02 270)", label: "primary 버튼" },
          { token: "--destructive", value: "oklch(0.577 0.245 27)", label: "삭제·경고" },
        ]}
      />
    </div>
  </section>
);
