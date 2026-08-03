import type { PriceSign } from "@/shared/types/quote";
import { cn } from "@/lib/utils";

type PriceChangeProps = {
  change: number;
  changeRate: number;
  sign?: PriceSign;
  symbol?: "sign" | "arrow";
  unit?: string;
  size?: "lg" | "sm" | "xs";
  // 변동폭(위) / 등락률(아래) 2단 세로 스택 렌더. 등락률 괄호 제거.
  // false(기본): 기존 인라인 "변동폭 (등락률%)" 렌더.
  stacked?: boolean;
  className?: string;
};

const SIGN_CLASS: Record<PriceSign, string> = {
  up: "text-price-up",
  down: "text-price-down",
  flat: "text-muted-foreground",
};

const SIZE_CLASS = {
  lg: "text-value font-medium",
  sm: "text-body-sm tabular-nums",
  xs: "text-caption font-medium tabular-nums",
} as const;

const ARROW: Record<PriceSign, string> = {
  up: "▲",
  down: "▼",
  flat: "·",
};

const resolveSign = (change: number, sign?: PriceSign): PriceSign => {
  if (sign) return sign;
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
};

// flat이면 부호 없음. 양수만 "+", 음수는 자연 "-" 그대로.
const prefix = (value: number, resolved: PriceSign): string => {
  if (resolved === "flat") return "";
  return value > 0 ? "+" : "";
};

export const PriceChange = ({
  change,
  changeRate,
  sign,
  symbol = "sign",
  unit,
  size = "sm",
  stacked = false,
  className,
}: PriceChangeProps) => {
  const resolved = resolveSign(change, sign);

  const changeText =
    symbol === "arrow"
      ? `${ARROW[resolved]} ${Math.abs(change).toLocaleString("ko-KR")}${unit ?? ""}`
      : `${prefix(change, resolved)}${change.toLocaleString("ko-KR")}${unit ?? ""}`;

  const rateText = `${prefix(changeRate, resolved)}${changeRate.toFixed(2)}%`;

  if (stacked) {
    return (
      <span
        className={cn(
          "inline-flex flex-col items-start leading-tight whitespace-nowrap",
          SIZE_CLASS[size],
          SIGN_CLASS[resolved],
          className,
        )}
      >
        <span>{changeText}</span>
        <span>{rateText}</span>
      </span>
    );
  }

  return (
    <span className={cn("whitespace-nowrap", SIZE_CLASS[size], SIGN_CLASS[resolved], className)}>
      {changeText} ({rateText})
    </span>
  );
};
