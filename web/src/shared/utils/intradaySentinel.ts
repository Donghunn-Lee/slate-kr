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

// 국내 종목 세션 갭 창 — 이 구간엔 체결 가능한 시장이 없다.
// KIS UN(KRX+NXT 통합) · J(KRX only) 응답이 이 공백을 O=H=L=C=직전 실체결가 ·
// vol=0 · acml_tr_pbmn 정지로 fill-forward 하여 보낸다 (2026-08-18 000660 raw 캡처).
// stck_cntg_hour 라벨(HHMMSS) = 해당 분 00~59초 체결이므로 "0850" = 08:50:00~08:50:59.
//   - 0850~0859: NXT 프리마감(08:50) ~ KRX 개장(09:00). UN 응답에만 fill row 존재
//     (J 응답은 09:00 이전 봉 자체 없음).
//   - 1520~1529: KRX 마감 동시호가 접수 창. 15:30 실체결(단일가) 봉은 창 밖.
//     UN·J 응답 모두 fill row 존재.
const DOMESTIC_SESSION_GAP_WINDOWS: readonly (readonly [string, string])[] = [
  ["0850", "0859"],
  ["1520", "1529"],
];

const isWithinGapWindow = (hhmm: string): boolean =>
  DOMESTIC_SESSION_GAP_WINDOWS.some(
    ([start, end]) => hhmm >= start && hhmm <= end,
  );

// KIS 종목분봉 raw row(HHMMSS 라벨 + cntg_vol) 기준 갭 fill 판정.
// vol===0 조건을 반드시 함께 요구 — 창 정의 오류·KIS 발행 규칙 변경으로 실체결
// 봉이 들어와도 살아남도록 안전 마진. isSentinelBar 는 ChartBar 시그니처 유지.
export const isDomesticSessionGapFill = (
  hhmmss: string,
  volume: number,
): boolean => volume === 0 && isWithinGapWindow(hhmmss.slice(0, 4));
