import Link from "next/link";
import { DemoFaultControl } from "./DemoFaultControl";

const EMPHASIS = "font-semibold text-foreground";

// sticky 헤더 둘째 줄. 한 줄 고정이라 좁은 폭에선 짧은 문구로 바꾸고, 그래도 넘치면 문구만 말줄임한다.
export const DemoBanner = () => (
  <div className="border-t border-border/60">
    <div className="mx-auto flex h-7 max-w-5xl items-center gap-2 px-4 text-caption text-muted-foreground">
      <p className="min-w-0 truncate">
        <span className="sm:hidden">
          시세 · 지수 · 순위는 <strong className={EMPHASIS}>가상 데이터</strong>입니다
        </span>
        <span className="hidden sm:inline">
          시세 · 지수 · 순위는 <strong className={EMPHASIS}>가상 데이터</strong>입니다. 재무 ·
          공시는 DART 실데이터입니다.
        </span>
      </p>
      <Link
        href="/credits#demo"
        className="shrink-0 underline underline-offset-2 transition-colors hover:text-foreground"
      >
        자세히
      </Link>
      <div className="ml-auto shrink-0">
        <DemoFaultControl />
      </div>
    </div>
  </div>
);
