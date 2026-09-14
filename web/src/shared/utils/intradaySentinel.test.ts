import { describe, it, expect } from "vitest";
import type { ChartBar } from "@/shared/types/quote";
import { isDomesticSessionGapFill, isSentinelBar } from "./intradaySentinel";

const bar = (over: Partial<ChartBar> = {}): ChartBar => ({
  time: 1_700_000_000,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 1000,
  ...over,
});

describe("isSentinelBar", () => {
  it("정상 봉 → false", () => {
    expect(isSentinelBar(bar())).toBe(false);
  });

  it("정상 봉 · volume 0 (저활동 분봉) → false — vol=0 자체는 sentinel 아님", () => {
    expect(isSentinelBar(bar({ volume: 0 }))).toBe(false);
  });

  it("정상 봉 · volume undefined → false", () => {
    expect(isSentinelBar(bar({ volume: undefined }))).toBe(false);
  });

  it("KIS INT64_MIN sentinel (문자열 '-9223372036854775808' 코어스 결과) → true", () => {
    // z.coerce.number() 는 Number("-9223372036854775808") = -9.223372036854776e+18 반환.
    const coerced = Number("-9223372036854775808");
    expect(coerced < 0).toBe(true); // 근사값이라도 부호는 정확.
    expect(isSentinelBar(bar({ volume: coerced }))).toBe(true);
  });

  it("음수 volume (임의 값) → true", () => {
    expect(isSentinelBar(bar({ volume: -1 }))).toBe(true);
  });

  it("OHLC 전부 0 → true (실체결 봉은 OHL 중 최소 하나가 non-zero)", () => {
    expect(
      isSentinelBar(bar({ open: 0, high: 0, low: 0, close: 0, volume: 0 })),
    ).toBe(true);
  });

  it("OHL 중 하나만 0 · 나머지 non-zero → false (정상 저변동 봉 가능)", () => {
    // 예: 모든 체결이 같은 가격이면 O=H=L=C 동일값 (0 아님)
    expect(isSentinelBar(bar({ open: 100, high: 100, low: 100, close: 100 }))).toBe(false);
  });

  it("OHLC 전부 0 · volume>0 → true (역시 OHL 신호가 우세)", () => {
    // 실측 근거상 이 조합은 등장하지 않지만 방어적으로 sentinel 처리.
    expect(
      isSentinelBar(bar({ open: 0, high: 0, low: 0, close: 0, volume: 500 })),
    ).toBe(true);
  });
});

describe("isDomesticSessionGapFill", () => {
  it("08:50 vol=0 → 컷 (창 시작 경계)", () => {
    expect(isDomesticSessionGapFill("085000", 0, "UN")).toBe(true);
  });

  it("08:59 vol=0 → 컷 (창 종료 경계)", () => {
    expect(isDomesticSessionGapFill("085900", 0, "UN")).toBe(true);
  });

  it("08:55 vol=0 → 컷 (창 내부)", () => {
    expect(isDomesticSessionGapFill("085500", 0, "UN")).toBe(true);
  });

  it("08:55 vol>0 → 보존 (실체결 봉이 들어오면 안전 조건이 살림)", () => {
    expect(isDomesticSessionGapFill("085500", 1, "UN")).toBe(false);
  });

  it("08:49 vol>0 → 보존 (창 직전 NXT 프리 실체결)", () => {
    expect(isDomesticSessionGapFill("084900", 9961, "UN")).toBe(false);
  });

  it("09:00 vol>0 → 보존 (창 직후 KRX 개장 실체결)", () => {
    expect(isDomesticSessionGapFill("090000", 266531, "UN")).toBe(false);
  });

  it("10:23 vol=0 → 보존 (창 밖 저활동 봉)", () => {
    expect(isDomesticSessionGapFill("102300", 0, "UN")).toBe(false);
  });

  it("15:20 vol=0 → 컷 (마감 창 시작 경계)", () => {
    expect(isDomesticSessionGapFill("152000", 0, "UN")).toBe(true);
  });

  it("15:29 vol=0 → 컷 (마감 창 종료 경계)", () => {
    expect(isDomesticSessionGapFill("152900", 0, "UN")).toBe(true);
  });

  it("15:25 vol=0 → 컷 (마감 창 내부)", () => {
    expect(isDomesticSessionGapFill("152500", 0, "UN")).toBe(true);
  });

  it("15:25 vol>0 → 보존 (실체결 봉이 들어오면 안전 조건이 살림)", () => {
    expect(isDomesticSessionGapFill("152500", 1, "UN")).toBe(false);
  });

  it("15:19 vol=0 → 보존 (마감 창 직전 · 정규 매매 시간대)", () => {
    expect(isDomesticSessionGapFill("151900", 0, "UN")).toBe(false);
  });

  it("15:30 vol>0 → 보존 (마감 단일가 실체결 봉은 창 밖)", () => {
    expect(isDomesticSessionGapFill("153000", 10409, "UN")).toBe(false);
  });

  it("15:31 vol=0 → 컷 (post-close 갭 시작 경계)", () => {
    expect(isDomesticSessionGapFill("153100", 0, "UN")).toBe(true);
  });

  it("15:35 vol=0 → 컷 (post-close 갭 내부)", () => {
    expect(isDomesticSessionGapFill("153500", 0, "UN")).toBe(true);
  });

  it("15:39 vol=0 → 컷 (post-close 갭 종료 경계)", () => {
    expect(isDomesticSessionGapFill("153900", 0, "UN")).toBe(true);
  });

  it("15:35 vol>0 → 보존 (NXT 애프터 조기 체결이 있으면 안전 조건이 살림)", () => {
    expect(isDomesticSessionGapFill("153500", 1, "UN")).toBe(false);
  });

  it("15:40 vol=0 → 보존 (NXT 애프터 개시 · UN 창 밖)", () => {
    expect(isDomesticSessionGapFill("154000", 0, "UN")).toBe(false);
  });
});

// J(KRX only) 는 NXT 애프터 개시(15:40) 가 창을 끝내지 않는다 — KRX 애프터마켓 16:00 까지
// 시간외 종가매매 실체결 외엔 fill row 뿐이라 창이 15:59 까지 이어진다.
describe("isDomesticSessionGapFill · J 전용 창 (15:40~15:59)", () => {
  it("15:40 vol=0 · J → 컷 (J 창 시작 경계)", () => {
    expect(isDomesticSessionGapFill("154000", 0, "J")).toBe(true);
  });

  it("15:59 vol=0 · J → 컷 (J 창 종료 경계)", () => {
    expect(isDomesticSessionGapFill("155900", 0, "J")).toBe(true);
  });

  it("15:47 vol>0 · J → 보존 (시간외 종가매매 실체결은 안전 조건이 살림)", () => {
    expect(isDomesticSessionGapFill("154700", 120, "J")).toBe(false);
  });

  it("16:00 vol=0 · J → 보존 (KRX 애프터마켓 개시 · 창 밖)", () => {
    expect(isDomesticSessionGapFill("160000", 0, "J")).toBe(false);
  });

  it("15:47 vol=0 · UN → 보존 (NXT 애프터 체결 구간 · 공통 창 밖)", () => {
    expect(isDomesticSessionGapFill("154700", 0, "UN")).toBe(false);
  });

  it("공통 창(08:50 · 15:25 · 15:35) 은 채널 무관하게 컷", () => {
    for (const hhmmss of ["085000", "152500", "153500"]) {
      expect(isDomesticSessionGapFill(hhmmss, 0, "J")).toBe(true);
      expect(isDomesticSessionGapFill(hhmmss, 0, "UN")).toBe(true);
    }
  });
});
