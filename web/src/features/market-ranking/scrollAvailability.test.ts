import { describe, it, expect } from "vitest";
import { computeScrollAvailability } from "./scrollAvailability";

describe("computeScrollAvailability", () => {
  it("scrollWidth 가 clientWidth 이하 → 양방향 false", () => {
    expect(computeScrollAvailability(0, 300, 400)).toEqual({
      canLeft: false,
      canRight: false,
    });
  });

  it("좌측 끝, 우측으로 넘침 → left false, right true", () => {
    expect(computeScrollAvailability(0, 800, 400)).toEqual({
      canLeft: false,
      canRight: true,
    });
  });

  it("중간 위치 → 양쪽 true", () => {
    expect(computeScrollAvailability(200, 800, 400)).toEqual({
      canLeft: true,
      canRight: true,
    });
  });

  it("우측 끝(1px 관대치) → left true, right false", () => {
    expect(computeScrollAvailability(400, 800, 400)).toEqual({
      canLeft: true,
      canRight: false,
    });
    expect(computeScrollAvailability(399, 800, 400)).toEqual({
      canLeft: true,
      canRight: false,
    });
  });
});
