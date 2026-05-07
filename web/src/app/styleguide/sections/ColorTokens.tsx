type SwatchGroupProps = {
  title: string;
  tokens: { token: string; value: string; label?: string }[];
};

const SwatchGroup = ({ title, tokens }: SwatchGroupProps) => (
  <div>
    <h3
      style={{
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-tertiary)",
        marginBottom: "12px",
      }}
    >
      {title}
    </h3>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "10px",
      }}
    >
      {tokens.map(({ token, value, label }) => (
        <div
          key={token}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px",
            borderRadius: "6px",
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "6px",
              backgroundColor: `var(${token})`,
              border: "1px solid oklch(0.85 0.005 85 / 60%)",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {token}
            </p>
            <p
              style={{
                fontSize: "10px",
                color: "var(--text-tertiary)",
                fontFamily: "monospace",
                marginTop: "1px",
              }}
            >
              {value}
            </p>
            {label && (
              <p style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "1px" }}>
                {label}
              </p>
            )}
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
    <h2
      style={{
        fontSize: "18px",
        fontWeight: 600,
        color: "var(--text-primary)",
        marginBottom: "24px",
        paddingBottom: "12px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      Color Tokens
    </h2>

    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      <SwatchGroup
        title="Base"
        tokens={[
          { token: "--bg-base", value: "oklch(0.98 0.005 85)", label: "페이지 배경" },
          { token: "--bg-elevated", value: "oklch(0.995 0.003 85)", label: "패널·카드 배경" },
          { token: "--text-primary", value: "oklch(0.25 0.02 270)", label: "본문 텍스트" },
          { token: "--text-secondary", value: "oklch(0.5 0.015 270)", label: "보조 텍스트" },
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
