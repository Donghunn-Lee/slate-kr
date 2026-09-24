import type { PriceSign } from "@/shared/types/quote";

export type PriceToneClass = "text-price-up" | "text-price-down" | "text-foreground";

// 등락 표기 색의 단일 결정점. 가격·변동폭·변동률 모두 이 결과를 쓴다.
// 입력은 변동값(부호 판정) 또는 이미 정규화된 PriceSign. 보합(0·-0)·데이터 없음(null·undefined·NaN)은
// foreground — 색은 상승/하락 신호에만 쓴다.
export const priceToneClass = (
  value: number | PriceSign | null | undefined,
): PriceToneClass => {
  if (value === "up") return "text-price-up";
  if (value === "down") return "text-price-down";
  if (typeof value === "number") {
    if (value > 0) return "text-price-up";
    if (value < 0) return "text-price-down";
  }
  return "text-foreground";
};
