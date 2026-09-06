import type { MemoSnapshot } from "@/shared/types/memo";

export const selectSnapshot = (s: {
  memos: MemoSnapshot["memos"];
}): MemoSnapshot => ({
  memos: s.memos,
});

// Postgres jsonb는 객체 키 순서를 보존하지 않으므로 memos 키를 정렬한 뒤 비교.
export const isSnapshotEqual = (
  a: MemoSnapshot | null,
  b: MemoSnapshot | null
): boolean => {
  if (a === null || b === null) return a === b;
  const normalize = (s: MemoSnapshot) => ({
    memos: Object.fromEntries(
      Object.keys(s.memos)
        .sort()
        .map((k) => [k, s.memos[k]])
    ),
  });
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
};
