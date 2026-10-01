import { describe, it, expect } from "vitest";
import { formatEps } from "./format";

describe("formatEps", () => {
  describe("maxFractionDigits = 0 (BPS)", () => {
    it("소수 → 정수 원으로 반올림", () => {
      expect(formatEps(6499.425, true, 0)).toBe("6,499원");
      expect(formatEps(68761.886, false, 0)).toBe("68,762");
    });

    it(".5 는 0 에서 먼 쪽으로 반올림", () => {
      // collector 의 bps 반올림(ROUND_HALF_UP)과 같은 방향 — 음수도 대칭.
      expect(formatEps(2.5, true, 0)).toBe("3원");
      expect(formatEps(-2.5, true, 0)).toBe("-3원");
    });

    it("0 으로 반올림되는 음수 → '-0' 이 아니라 '0'", () => {
      expect(formatEps(-0.4, true, 0)).toBe("0원");
    });
  });

  describe("기본 자릿수 (EPS·DPS)", () => {
    it("DART 가 소수로 공시한 EPS 는 보존", () => {
      // 소수 EPS 는 실제 공시값에 존재한다(예: 159.7, 0.01).
      expect(formatEps(159.7)).toBe("159.7원");
      expect(formatEps(0.01, false)).toBe("0.01");
    });

    it("정수·음수는 그대로", () => {
      expect(formatEps(1668)).toBe("1,668원");
      expect(formatEps(-1234)).toBe("-1,234원");
    });
  });

  it("null → '—'", () => {
    expect(formatEps(null)).toBe("—");
    expect(formatEps(null, true, 0)).toBe("—");
  });
});
