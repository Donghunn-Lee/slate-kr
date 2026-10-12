import { readFileSync } from "node:fs";
import path from "node:path";
import { PriceChange } from "@/shared/components/PriceChange";

// 토큰 값의 단일 소스는 globals.css — 상수로 복제하지 않고 빌드 시 원문에서 읽는다.
// (브라우저에는 Lightning CSS 가 oklch 를 hex + lab 으로 변환한 값만 남아 런타임 읽기로는 원문을 얻을 수 없다.)
const globalsCss = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** 최상위 `selector {` 블록 안의 `--token: value;` 선언을 읽는다 (값 뒤 주석은 제외) */
const parseTokenBlock = (selector: string) => {
  const start = globalsCss.indexOf(`\n${selector} {`);
  const end = globalsCss.indexOf("\n}", start);
  const block = globalsCss.slice(start, end);
  return new Map([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, token, value]) => [token, value.trim()]));
};

const TOKEN_VALUES = { light: parseTokenBlock(":root"), dark: parseTokenBlock(".dark") };

/** globals.css 의 라이트·다크 값을 둘 다 렌더하고 .dark 클래스로 표시를 전환한다. .dark 재선언이 없는 토큰은 공용값 */
const TokenValue = ({ token }: { token: string }) => (
  <>
    <span className="dark:hidden">{TOKEN_VALUES.light.get(token) ?? "—"}</span>
    <span className="hidden dark:inline">
      {TOKEN_VALUES.dark.get(token) ?? TOKEN_VALUES.light.get(token) ?? "—"}
    </span>
  </>
);

type SwatchGroupProps = {
  title: string;
  /** value 를 생략하면 globals.css 에 선언된 값을 표시한다 */
  tokens: { token: string; value?: string; label?: string }[];
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
            <p className="mt-px font-mono text-[10px] text-muted-foreground">
              {value ?? <TokenValue token={token} />}
            </p>
            {label && <p className="mt-px text-[10px] text-muted-foreground">{label}</p>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ACCENT_COLORS = [
  {
    name: "Sky",
    prefix: "sky",
    extra: [{ token: "--sky-text", label: "글자색 (AA 4.5:1)" }],
  },
  { name: "Sage", prefix: "sage" },
  {
    name: "Amber",
    prefix: "amber",
    extra: [{ token: "--amber-text", label: "글자색 (AA 4.5:1)" }],
  },
  { name: "Lavender", prefix: "lavender" },
  { name: "Peach", prefix: "peach" },
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
          { token: "--bg-base", label: "페이지 배경" },
          { token: "--bg-elevated", label: "패널·카드 배경" },
          { token: "--text-primary", label: "본문 텍스트" },
          { token: "--text-secondary", label: "보조 텍스트" },
          { token: "--text-tertiary", label: "캡션·레이블" },
          { token: "--border-subtle", label: "구분선" },
          { token: "--border-default", label: "컴포넌트 테두리" },
        ]}
      />

      <SwatchGroup
        title="Functional — 등락 (상승 Red / 하락 Blue)"
        tokens={[
          { token: "--price-up", label: "상승" },
          { token: "--price-down", label: "하락" },
        ]}
      />
      <ul className="-mt-5 list-disc space-y-0.5 pl-5 text-body-sm text-muted-foreground">
        <li>가격·변동폭·등락률 모두 등락색(price-up / price-down)으로 표기한다. 클래스는 priceToneClass 단일 출처.</li>
        <li>보합(변동 0)·데이터 없음(null)은 text-foreground를 명시한다.</li>
        <li>예외: 52주 고/저는 부호와 무관한 고정색(고=price-up, 저=price-down)을 유지한다.</li>
        <li>차트(CHART_THEME)의 상승·하락 색은 CSS 토큰의 computed sRGB와 동일값이어야 한다(라이트·다크 각각).</li>
      </ul>
      <div className="flex flex-wrap items-baseline gap-6">
        <PriceChange change={1250} changeRate={1.84} unit="원" />
        <PriceChange change={-830} changeRate={-1.12} unit="원" />
        <PriceChange change={0} changeRate={0} unit="원" />
      </div>

      <SwatchGroup
        title="Functional — 상태 (라이트·다크 공용)"
        tokens={[
          { token: "--live", label: "실시간 시세 점" },
        ]}
      />

      {ACCENT_COLORS.map(({ name, prefix, extra = [] }) => (
        <SwatchGroup
          key={prefix}
          title={`Accent — ${name}`}
          tokens={[
            { token: `--${prefix}-bg`, label: "배경" },
            { token: `--${prefix}-border`, label: "테두리" },
            { token: `--${prefix}-accent`, label: "아이콘·강조" },
            ...extra,
          ]}
        />
      ))}

      <SwatchGroup
        title="Disclosure — 공시 카테고리 (6종 × bg/text)"
        tokens={[
          { token: "--disclosure-major-event-bg", label: "주요사항 배경" },
          { token: "--disclosure-major-event-text", label: "주요사항 텍스트" },
          { token: "--disclosure-financial-bg", label: "정기보고서 배경" },
          { token: "--disclosure-financial-text", label: "정기보고서 텍스트" },
          { token: "--disclosure-ownership-bg", label: "소유상황 배경" },
          { token: "--disclosure-ownership-text", label: "소유상황 텍스트" },
          { token: "--disclosure-audit-bg", label: "감사 배경" },
          { token: "--disclosure-audit-text", label: "감사 텍스트" },
          { token: "--disclosure-shareholder-meeting-bg", label: "주주총회 배경 (텍스트는 --amber-text)" },
          { token: "--disclosure-market-action-bg", label: "시장조치 배경" },
          { token: "--disclosure-market-action-text", label: "시장조치 텍스트" },
        ]}
      />

      <SwatchGroup
        title="Disclosure — 기타 (칩 전용)"
        tokens={[
          { token: "--disclosure-uncategorized-bg", label: "기타 배경" },
          { token: "--disclosure-uncategorized-text", label: "기타 텍스트" },
        ]}
      />

      <SwatchGroup
        title="shadcn/ui — Semantic"
        tokens={[
          { token: "--background", value: "→ bg-base", label: "body 배경" },
          { token: "--foreground", value: "→ text-primary", label: "body 텍스트" },
          { token: "--card", value: "→ bg-elevated", label: "카드" },
          { token: "--border", value: "→ border-default", label: "기본 테두리" },
          { token: "--muted", label: "muted 배경" },
          { token: "--muted-foreground", value: "→ text-secondary", label: "muted 텍스트" },
          { token: "--primary", label: "primary 버튼" },
          { token: "--destructive", label: "삭제·경고" },
        ]}
      />
    </div>
  </section>
);
