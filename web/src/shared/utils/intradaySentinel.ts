import type { ChartBar } from "@/shared/types/quote";

// KIS FHKST03010200 (inquire-time-itemchartprice) 응답에서 `cntg_vol` 필드가
// INT64_MIN(-9,223,372,036,854,775,808) 문자열로 오는 케이스가 있음 — 비NXT 종목을
// UN/NX marketDiv 로 호출했을 때 확장 세션 시간대 anchor 가 반환하는 "무의미 봉" 신호
// (실측: 카카오 035720 UN anchor=080000 → 30봉 모두 이 값 + OHL=0. #probe 확인).
//
// Zod z.coerce.number() 통과 후엔 IEEE-754 double 근사값이라 정확 비교가 불안정하므로
// 실측치가 절대 음수일 수 없다는 사실만 사용해 `< 0` 을 sentinel 신호로 삼는다.
// 부가 신호: OHL 모두 0 (실체결 봉은 O/H/L 중 최소 하나는 non-zero).

const isNegativeVolume = (v: number | undefined): boolean =>
  v !== undefined && v < 0;

const isAllZeroOhl = (b: {
  open: number;
  high: number;
  low: number;
  close: number;
}): boolean => b.open === 0 && b.high === 0 && b.low === 0 && b.close === 0;

export const isSentinelBar = (b: ChartBar): boolean =>
  isNegativeVolume(b.volume) || isAllZeroOhl(b);
