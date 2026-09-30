type SyncStatus = "idle" | "loading" | "synced" | "blocked" | "error";

// 서버 상태를 모르는 동안(idle·loading·blocked)은 lastConfirmed 가 null 이라 비교가 항상 "다름"이 되고,
// keepalive PUT 이 로컬로 서버 백업을 덮는다 — 로딩 중 편집분을 잃더라도 보내지 않는다.
// lastConfirmed null 이 아니라 상태로 거르는 이유: 마커 없는 로컬 마이그레이션은 null 기준의 synced 라
// 전체 업로드가 나가야 한다. error 는 PUT 실패일 뿐 기준이 확정돼 있어 synced 와 같게 다룬다.
export const shouldFlushOnPageHide = <T>(
  status: SyncStatus,
  current: T,
  lastConfirmed: T | null,
  isEqual: (a: T, b: T | null) => boolean
): boolean => {
  if (status !== "synced" && status !== "error") return false;
  return !isEqual(current, lastConfirmed);
};
