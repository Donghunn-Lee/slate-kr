type Role = {
  name: string;
  utility: string;
  desktopPx: number;
  mobilePx: number;
  lineHeight: string;
  letterSpacing?: string;
  usage: string;
  replaces: string;
  sample: string;
};

const ROLES: Role[] = [
  {
    name: "display",
    utility: "text-display",
    desktopPx: 36,
    mobilePx: 28,
    lineHeight: "1.15",
    letterSpacing: "-0.02em",
    usage: "라이브 현재가·랜딩 히어로 수치",
    replaces: "text-4xl",
    sample: "219,500원",
  },
  {
    name: "headline",
    utility: "text-headline",
    desktopPx: 24,
    mobilePx: 20,
    lineHeight: "1.25",
    letterSpacing: "-0.01em",
    usage: "종목명·페이지 타이틀 h1/h2",
    replaces: "text-2xl",
    sample: "삼성전자",
  },
  {
    name: "value",
    utility: "text-value",
    desktopPx: 18,
    mobilePx: 16,
    lineHeight: "1.3",
    usage: "핵심 지표 값·강조 수치",
    replaces: "text-lg",
    sample: "12.34배",
  },
  {
    name: "body",
    utility: "text-body",
    desktopPx: 14,
    mobilePx: 13,
    lineHeight: "1.5",
    usage: "본문 · 슬레이트 헤더 · 행 텍스트",
    replaces: "text-sm",
    sample: "주가·재무·공시 정보를 빠르게 조회할 수 있습니다.",
  },
  {
    name: "body-sm",
    utility: "text-body-sm",
    desktopPx: 13,
    mobilePx: 12,
    lineHeight: "1.45",
    usage: "PriceChange·보조 텍스트",
    replaces: "text-[13px]",
    sample: "직전 거래일",
  },
  {
    name: "caption",
    utility: "text-caption",
    desktopPx: 12,
    mobilePx: 11,
    lineHeight: "1.4",
    letterSpacing: "0.01em",
    usage: "메타·설명 문구",
    replaces: "text-xs",
    sample: "기준일 2026-04-24",
  },
  {
    name: "micro",
    utility: "text-micro",
    desktopPx: 11,
    mobilePx: 10,
    lineHeight: "1.35",
    letterSpacing: "0.01em",
    usage: "배지·시장 라벨·아주 작은 힌트",
    replaces: "text-[11px]",
    sample: "KOSPI · 일시 지연",
  },
];

type TypeRowProps = {
  role: Role;
};

const TypeRow = ({ role }: TypeRowProps) => (
  <div className="grid grid-cols-1 items-baseline gap-2 border-b border-subtle py-5 md:grid-cols-[180px_1fr] md:gap-6">
    <div>
      <p className="mb-1 font-mono text-[11px] font-semibold text-foreground">{role.utility}</p>
      <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
        {role.desktopPx}px → {role.mobilePx}px (&lt;640)
        <br />
        lh {role.lineHeight}
        {role.letterSpacing ? ` · ls ${role.letterSpacing}` : ""}
      </p>
      <p className="mt-px text-[10px] text-muted-foreground">{role.usage}</p>
      <p className="mt-px font-mono text-[10px] text-muted-foreground/70">
        replaces {role.replaces}
      </p>
    </div>
    <div className={role.utility}>{role.sample}</div>
  </div>
);

export const Typography = () => (
  <section>
    <h2 className="mb-2 border-b border-subtle pb-3 text-lg font-semibold text-foreground">
      Typography
    </h2>
    <p className="mb-6 text-[13px] text-muted-foreground">
      role 기반 font-size 토큰 — 뷰포트 640px 미만에서 각 role이 모바일 값으로 자동 축소.
      샘플 텍스트는 실제 유틸리티 클래스로 렌더링되며, 창 너비를 좁히면 크기가 반영된다.
    </p>

    <div>
      {ROLES.map((role) => (
        <TypeRow key={role.name} role={role} />
      ))}
    </div>
  </section>
);
