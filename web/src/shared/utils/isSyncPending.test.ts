import { describe, it, expect } from "vitest";
import { isSyncPending } from "./isSyncPending";

describe("isSyncPending", () => {
  it("idle · 동기화 훅 마운트 전 → pending", () => {
    expect(isSyncPending("idle")).toBe(true);
  });

  it("loading → pending", () => {
    expect(isSyncPending("loading")).toBe(true);
  });

  it("synced → pending 아님", () => {
    expect(isSyncPending("synced")).toBe(false);
  });

  // blocked·error 는 로드가 끝난 뒤의 상태 — 편집은 열어 두고 배지로만 알린다.
  it("blocked → pending 아님", () => {
    expect(isSyncPending("blocked")).toBe(false);
  });

  it("error → pending 아님", () => {
    expect(isSyncPending("error")).toBe(false);
  });
});
