import { describe, it, expect } from "vitest";
import { resolveDomesticVolume } from "./IndexDetailPane";

// 국내 거래량 셀 소스 — 라이브 quote(acml_vol) 우선, 개장 전·라이브 부재는 EOD.
describe("resolveDomesticVolume", () => {
  const eod = { date: "2026-09-15", volume: 287_884_000 };
  const live = { volume: 197_715_000 };

  it("regular · 라이브 volume 有 → 라이브 값 + quote 거래일 (EOD 미적재 당일)", () => {
    expect(resolveDomesticVolume(live, "regular", "2026-09-16", eod)).toEqual({
      volume: 197_715_000,
      asOf: "09-16",
    });
  });

  it("after · after_close 도 라이브 (마감 후 EOD 적재 전 구간)", () => {
    expect(resolveDomesticVolume(live, "after", "2026-09-16", eod).asOf).toBe("09-16");
    expect(resolveDomesticVolume(live, "after_close", "2026-09-16", eod).asOf).toBe(
      "09-16",
    );
  });

  it("pre · preopen → EOD (개장 전 누적 거래량은 무의미 — IndexChart 게이트와 동형)", () => {
    expect(resolveDomesticVolume(live, "pre", "2026-09-16", eod)).toEqual({
      volume: 287_884_000,
      asOf: "09-15",
    });
    expect(resolveDomesticVolume(live, "preopen", "2026-09-16", eod).asOf).toBe("09-15");
  });

  it("라이브 부재(null) · volume 결측 → EOD", () => {
    expect(resolveDomesticVolume(null, "regular", "2026-09-16", eod).asOf).toBe("09-15");
    expect(resolveDomesticVolume({}, "regular", "2026-09-16", eod).asOf).toBe("09-15");
  });

  it("quote 거래일 미도착(undefined) → EOD", () => {
    expect(resolveDomesticVolume(live, "regular", undefined, eod).asOf).toBe("09-15");
  });

  it("EOD 도 없으면 null/null", () => {
    expect(resolveDomesticVolume(null, "closed", undefined, null)).toEqual({
      volume: null,
      asOf: null,
    });
  });
});
