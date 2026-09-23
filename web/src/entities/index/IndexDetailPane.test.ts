import { describe, it, expect } from "vitest";
import { resolveDomesticVolume } from "./IndexDetailPane";

// 국내 거래량 셀 소스 — 라이브 quote(acml_vol) 우선, 개장 전 창·라이브 부재는 EOD.
describe("resolveDomesticVolume", () => {
  const eod = { date: "2026-09-15", volume: 287_884_000 };
  const live = { volume: 197_715_000 };

  it("창 밖 · 라이브 volume 有 → 라이브 값 + quote 거래일 (EOD 미적재 당일)", () => {
    expect(resolveDomesticVolume(live, false, "2026-09-16", eod)).toEqual({
      volume: 197_715_000,
      asOf: "09-16",
    });
  });

  // 06:00~08:00 은 창 밖이지만 quote 거래일이 EOD 최신 봉과 같은 전일 — 라이브로 가도 같은 날짜.
  it("이른 preopen(창 밖) · quote 거래일 = EOD 날짜 → 라이브, 같은 거래일", () => {
    expect(resolveDomesticVolume(live, false, "2026-09-15", eod).asOf).toBe("09-15");
  });

  it("개장 전 창 → EOD (IndexChart 게이트와 동형)", () => {
    expect(resolveDomesticVolume(live, true, "2026-09-16", eod)).toEqual({
      volume: 287_884_000,
      asOf: "09-15",
    });
  });

  it("라이브 부재(null) · volume 결측 → EOD", () => {
    expect(resolveDomesticVolume(null, false, "2026-09-16", eod).asOf).toBe("09-15");
    expect(resolveDomesticVolume({}, false, "2026-09-16", eod).asOf).toBe("09-15");
  });

  it("quote 거래일 미도착(undefined) → EOD", () => {
    expect(resolveDomesticVolume(live, false, undefined, eod).asOf).toBe("09-15");
  });

  it("EOD 도 없으면 null/null", () => {
    expect(resolveDomesticVolume(null, false, undefined, null)).toEqual({
      volume: null,
      asOf: null,
    });
  });
});
