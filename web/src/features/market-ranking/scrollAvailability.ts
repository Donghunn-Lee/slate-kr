export type ScrollAvailability = { canLeft: boolean; canRight: boolean };

// 브라우저 layout 반올림으로 scrollLeft + clientWidth 가 scrollWidth 를 1px 정도
// 안 채우는 경우가 있어 우측 여지 판정에 1px 관대치를 둔다.
export const computeScrollAvailability = (
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): ScrollAvailability => ({
  canLeft: scrollLeft > 0,
  canRight: scrollLeft + clientWidth < scrollWidth - 1,
});
