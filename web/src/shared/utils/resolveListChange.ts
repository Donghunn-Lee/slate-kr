// 리스트 표면(관심종목 행·홈 미리보기·검색 결과)의 등락 한 칸. 라이브 값은 오늘 축이라 그대로
// 두고, 개장 전 창의 0% 리셋은 EOD 폴백 팔에만 얹는다 — 가격은 이미 오늘 기준가라 손대지
// 않는다. eod undefined 는 EOD 행 부재(리셋할 폴백 자체가 없어 0 이 아니라 null), null 은 행은
// 있으나 등락 결측(행이 있으니 리셋은 0).
export const resolveListChange = (
  live: number | null,
  eod: number | null | undefined,
  preReset: boolean,
): number | null => {
  if (live !== null) return live;
  if (eod === undefined) return null;
  return preReset ? 0 : eod;
};
