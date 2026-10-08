// 항목이 가시 영역 밖으로 걸친 쪽 가장자리만 맞춘다. 이미 다 보이면 현재 위치 그대로.
export const nearestScrollLeft = (
  itemStart: number,
  itemEnd: number,
  scrollLeft: number,
  clientWidth: number,
): number => {
  if (itemStart < scrollLeft) return itemStart;
  if (itemEnd > scrollLeft + clientWidth) return itemEnd - clientWidth;
  return scrollLeft;
};
