import { describe, it, expect } from "vitest";
import { shouldFlushOnPageHide } from "./shouldFlushOnPageHide";

type Snapshot = { tickers: string[] };

// 두 훅의 isSnapshotEqual 과 같은 null 규칙 — 한쪽만 null 이면 "다름".
const isEqual = (a: Snapshot, b: Snapshot | null) =>
  b !== null && JSON.stringify(a) === JSON.stringify(b);

const confirmed: Snapshot = { tickers: ["005930"] };
const edited: Snapshot = { tickers: ["005930", "000660"] };

describe("shouldFlushOnPageHide", () => {
  // loading·blocked 의 기준 스냅샷은 항상 null — 비교만으로는 "다름"이 나온다.
  it("loading · 로컬이 기준과 달라 보여도 → 보내지 않음", () => {
    expect(shouldFlushOnPageHide("loading", edited, null, isEqual)).toBe(false);
  });

  // 빈 로컬이 서버 백업을 지우는 경로.
  it("blocked · 로컬이 비어 있어도 → 보내지 않음", () => {
    expect(shouldFlushOnPageHide("blocked", { tickers: [] }, null, isEqual)).toBe(false);
  });

  it("synced · 현재 == 마지막 확정 → 보내지 않음", () => {
    expect(shouldFlushOnPageHide("synced", { tickers: ["005930"] }, confirmed, isEqual)).toBe(
      false
    );
  });

  it("synced · 현재 != 마지막 확정 → 보냄", () => {
    expect(shouldFlushOnPageHide("synced", edited, confirmed, isEqual)).toBe(true);
  });

  // 마커 없는 경로의 로컬 마이그레이션은 기준을 null 로 둔 synced — 기준 null 만으로 막으면 안 된다.
  it("synced · 마지막 확정 null (마커 없음, 로컬 마이그레이션 대기) → 보냄", () => {
    expect(shouldFlushOnPageHide("synced", edited, null, isEqual)).toBe(true);
  });
});
