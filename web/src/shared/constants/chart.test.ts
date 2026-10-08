import { describe, it, expect } from "vitest";
import type { UTCTimestamp } from "lightweight-charts";
import { crosshairLocalization } from "./chart";

// 미국 7/15 11:00 EDT 벽시계 인코딩 — KST 로 옮기면 날짜가 바뀌는 시각이라 두 경로가 갈린다.
const NY_1100 = Math.floor(Date.UTC(2026, 6, 15, 11, 0) / 1000) as UTCTimestamp;

describe("crosshairLocalization timeFormatter", () => {
  it("시간대 미전달 → 인코딩된 벽시계 그대로 MM-DD HH:mm", () => {
    expect(crosshairLocalization(true).timeFormatter(NY_1100)).toBe("07-15 11:00");
  });

  it("시간대 전달 → KST 로 옮긴 MM-DD HH:mm (익일 00:00)", () => {
    expect(
      crosshairLocalization(true, "America/New_York").timeFormatter(NY_1100),
    ).toBe("07-16 00:00");
  });

  it("시간대 전달 · 일봉 문자열 time → 거래일 그대로", () => {
    expect(
      crosshairLocalization(false, "America/New_York").timeFormatter("2026-07-15"),
    ).toBe("2026-07-15");
  });
});
