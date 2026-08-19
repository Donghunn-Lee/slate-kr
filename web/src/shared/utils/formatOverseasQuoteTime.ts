import type { IndexQuote } from "@/shared/types/quote";

// 해외 지수 quote 체결시각 → "MM-DD HH:mm (현지)".
// 입력은 거래소 현지 로컬(YYYYMMDD·HHMMSS 문자열, KIS FHKST03030200 output2[0]).
// 초는 절삭. 타임존 변환·해석 금지 — 라벨은 "현지" 표시로 사용자에게 위임.
// null 입력·검증 실패 시 null (호출측이 세션 템플릿으로 폴백).
export const formatOverseasQuoteTime = (
  time: IndexQuote["time"],
): string | null => {
  if (!time) return null;
  const { date, hour } = time;
  if (date.length !== 8 || hour.length !== 6) return null;
  const mm = date.slice(4, 6);
  const dd = date.slice(6, 8);
  const hh = hour.slice(0, 2);
  const min = hour.slice(2, 4);
  return `${mm}-${dd} ${hh}:${min} (현지)`;
};
