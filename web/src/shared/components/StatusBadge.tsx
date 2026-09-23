import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  label: string;
  title?: string;
  // 배치(ml-auto·shrink-0 등) 전용 — 배지 외형은 고정.
  className?: string;
};

// 부분 실패("일시 지연"·"서버 저장 안 됨") 표시용 소형 무채 outline 배지.
// 판정은 호출처 소관 — 여기선 표시만 한다.
export const StatusBadge = ({ label, title, className }: StatusBadgeProps) => (
  <span
    title={title}
    className={cn(
      "rounded-sm border border-subtle bg-muted px-1.5 py-0.5 text-micro leading-none text-muted-foreground",
      className,
    )}
  >
    {label}
  </span>
);
