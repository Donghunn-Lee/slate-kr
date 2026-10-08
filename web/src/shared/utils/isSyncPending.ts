type SyncStatus = "idle" | "loading" | "synced" | "blocked" | "error";

// 첫 로드가 끝나기 전. 로드 결과는 항상 서버가 로컬을 덮으므로 이 동안의 편집은 남지 않는다.
// idle 도 포함하는 이유: 편집 버튼이 동기화 훅보다 먼저 hydrate 되는 틈의 편집도 이어지는 로드에 덮인다.
export const isSyncPending = (status: SyncStatus): boolean =>
  status === "idle" || status === "loading";
