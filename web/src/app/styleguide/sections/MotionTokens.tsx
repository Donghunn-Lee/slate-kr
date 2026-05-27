type MotionTokenCardProps = {
  token: string;
  value: string;
  label: string;
  swatch?: React.ReactNode;
};

const MotionTokenCard = ({ token, value, label, swatch }: MotionTokenCardProps) => (
  <div className="flex items-center gap-2.5 rounded-sm border border-subtle bg-elevated p-2">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-subtle font-mono text-[9px] text-muted-foreground">
      {swatch ?? value}
    </div>
    <div className="min-w-0">
      <p className="truncate font-mono text-[11px] font-semibold text-foreground">{token}</p>
      <p className="mt-px font-mono text-[10px] text-muted-foreground">{value}</p>
      <p className="mt-px text-[10px] text-muted-foreground">{label}</p>
    </div>
  </div>
);

// cubic-bezier(0.4, 0, 0.2, 1) — M 0 40 C 16 40, 8 0, 40 0
const EaseCurveSwatch = () => (
  <svg width="24" height="24" viewBox="0 0 40 40" fill="none" className="block">
    <path
      d="M 0 40 C 16 40, 8 0, 40 0"
      stroke="var(--muted-foreground)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MOTION_TOKENS: MotionTokenCardProps[] = [
  { token: "--duration-fast", value: "150ms", label: "패널 hover, 행 인터랙션" },
  { token: "--duration-base", value: "250ms", label: "패널 expand, 전환 애니메이션" },
  { token: "--duration-slow", value: "400ms", label: "페이지 레벨 전환" },
  {
    token: "--ease-smooth",
    value: "cubic-bezier(0.4, 0, 0.2, 1)",
    label: "기본 이징 곡선",
    swatch: <EaseCurveSwatch />,
  },
];

export const MotionTokens = () => (
  <section>
    <h2 className="mb-2 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Motion Tokens
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      duration · easing 토큰 정의 — 인터랙션 구현 시 참조
    </p>
    <div
      className="grid gap-2.5"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
    >
      {MOTION_TOKENS.map((t) => (
        <MotionTokenCard key={t.token} {...t} />
      ))}
    </div>
  </section>
);
