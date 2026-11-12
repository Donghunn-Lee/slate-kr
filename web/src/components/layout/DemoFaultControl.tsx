"use client";

import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  DEMO_FAULT_COOKIE,
  parseDemoFaultMode,
  type DemoFaultMode,
} from "@/shared/constants/demoFaultCookie";
import { useMounted } from "@/shared/hooks/useMounted";

// 켜 둔 채 잊어도 1시간 뒤 브라우저가 지운다.
const COOKIE_MAX_AGE_SEC = 60 * 60;

const MODE_LABEL: Record<DemoFaultMode, string> = {
  delay: "지연 3초",
  fail: "실패 응답",
};

// 정상은 쿠키가 없는 상태 — 토글 값은 파서가 null 로 읽는 값이면 된다.
const NORMAL_VALUE = "normal";

const OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: NORMAL_VALUE, label: "정상" },
  { value: "delay", label: MODE_LABEL.delay },
  { value: "fail", label: MODE_LABEL.fail },
];

const readFaultMode = (): DemoFaultMode | null => {
  const entry = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DEMO_FAULT_COOKIE}=`));
  return parseDemoFaultMode(entry?.slice(DEMO_FAULT_COOKIE.length + 1));
};

const writeFaultMode = (mode: DemoFaultMode | null): void => {
  const maxAge = mode === null ? 0 : COOKIE_MAX_AGE_SEC;
  document.cookie = `${DEMO_FAULT_COOKIE}=${mode ?? ""}; path=/; SameSite=Lax; max-age=${maxAge}`;
};

export const DemoFaultControl = () => {
  // 쿠키는 마운트 뒤에만 읽는다 — 서버 렌더는 항상 정상 상태.
  const mounted = useMounted();
  const mode = mounted ? readFaultMode() : null;
  const label = mode === null ? "데모 설정" : `장애 시뮬레이션: ${MODE_LABEL[mode]}`;

  const handleValueChange = (value: string) => {
    // 선택된 항목을 다시 누르면 선택 해제("")가 온다 — 모드는 셋 중 하나여야 한다.
    if (!value) return;
    writeFaultMode(parseDemoFaultMode(value));
    // React Query 캐시를 지우는 대신 다시 불러온다 — 훅마다 초기 상태가 달라 리셋 결과가
    // 제각각이고, 새로고침이면 전 섹션이 첫 로드 경로를 탄다.
    window.location.reload();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={label}
          className={cn(
            "relative text-caption",
            mode === null
              ? "text-muted-foreground"
              : "border-amber-border bg-amber-bg text-amber-text hover:bg-amber-bg/70 hover:text-amber-text aria-expanded:bg-amber-bg aria-expanded:text-amber-text"
          )}
        >
          <FlaskConical />
          <span className="hidden sm:inline">{label}</span>
          {mode !== null && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-accent sm:hidden"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12}>
        <PopoverHeader>
          <PopoverTitle>장애 시뮬레이션</PopoverTitle>
          <PopoverDescription className="text-caption break-keep">
            가격 API(시세 · 차트 · 지수 · 순위)에 지연이나 실패를 주입해 섹션별 로딩 · 실패 화면을
            확인합니다. 이 브라우저에만 적용되고 1시간 뒤 자동 해제됩니다.
          </PopoverDescription>
        </PopoverHeader>
        <ToggleGroup
          type="single"
          value={mode ?? NORMAL_VALUE}
          onValueChange={handleValueChange}
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
        >
          {OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1 text-caption">
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-caption text-muted-foreground">선택하면 페이지를 다시 불러옵니다.</p>
      </PopoverContent>
    </Popover>
  );
};
