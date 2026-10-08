import { describe, it, expect } from "vitest";
import { nearestScrollLeft } from "./nearestScrollLeft";

describe("nearestScrollLeft", () => {
  it("가시 영역 안 → 현재 위치 유지", () => {
    expect(nearestScrollLeft(120, 180, 100, 200)).toBe(100);
  });

  it("양 끝이 가시 영역 경계와 같음 → 현재 위치 유지", () => {
    expect(nearestScrollLeft(100, 300, 100, 200)).toBe(100);
  });

  it("왼쪽으로 가려짐 → 항목 시작을 왼쪽 경계에", () => {
    expect(nearestScrollLeft(40, 90, 100, 200)).toBe(40);
  });

  it("오른쪽으로 가려짐 → 항목 끝을 오른쪽 경계에", () => {
    expect(nearestScrollLeft(260, 340, 100, 200)).toBe(140);
  });
});
