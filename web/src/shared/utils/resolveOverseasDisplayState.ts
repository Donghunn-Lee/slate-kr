import {
  OVERSEAS_INDEX_CLOSE_LOCAL,
  type OverseasIndexCode,
} from "@/shared/constants/indices";
import type { IndexQuote } from "@/shared/types/quote";

// 해외 지수 헤더 라벨의 표시 상태.
// - live: 당일 세션 체결 진행 중 (체결시각 hour < close)
// - closed: 마감 후 (체결시각 hour >= close). 해제는 새 세션 첫 체결시각 도착 시 자동
//   — 시각 자체가 hour < close 로 돌아오면 다시 live 로 판정된다. 리셋 시각·open 상수 불필요.
// - eod_only: quote.time === null (.DJI 계열 or 응답 파싱 실패). 라이브 시각 정보 없음
export type OverseasDisplayState =
  | { kind: "live" }
  | { kind: "closed" }
  | { kind: "eod_only" };

// KIS 체결시각 hour 는 거래소 현지 로컬 문자열 그대로 → close 상수(HHMM)와 앞 4자리를
// lexicographic 비교하면 시각 비교와 동치. 타임존 변환 없이 판정 가능.
export const resolveOverseasDisplayState = (
  time: IndexQuote["time"],
  code: OverseasIndexCode,
): OverseasDisplayState => {
  if (!time) return { kind: "eod_only" };
  const { hour } = time;
  if (hour.length !== 6) return { kind: "eod_only" };
  const hhmm = hour.slice(0, 4);
  const close = OVERSEAS_INDEX_CLOSE_LOCAL[code];
  return hhmm >= close ? { kind: "closed" } : { kind: "live" };
};
