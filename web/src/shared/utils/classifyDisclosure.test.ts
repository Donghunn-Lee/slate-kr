import { describe, it, expect } from "vitest";
import { classifyDisclosure, isExchangeFiled, DisclosureType } from "@/shared/utils/classifyDisclosure";
import {
  CURATED_CASES,
  EXCHANGE_FILED_SAMPLE,
  MISCLASSIFIED_SEEDS,
} from "./classifyDisclosure.fixtures";

// 픽스처는 DART 원본 스키마(snake_case)를 유지 — 호출부에서 camelCase 인자로 매핑.

describe("CURATED_CASES", () => {
  it.each(CURATED_CASES)(
    "classifyDisclosure($report_nm, $flr_nm) === $expected",
    ({ report_nm, flr_nm, expected }) => {
      expect(classifyDisclosure(report_nm, flr_nm)).toBe(expected);
    }
  );
});

describe("isExchangeFiled", () => {
  it("유가증권시장본부 완전 일치 → true", () => {
    expect(isExchangeFiled("유가증권시장본부")).toBe(true);
  });

  it("코스닥시장본부 완전 일치 → true", () => {
    expect(isExchangeFiled("코스닥시장본부")).toBe(true);
  });

  it("코넥스시장 → false (의도적 제외)", () => {
    expect(isExchangeFiled("코넥스시장")).toBe(false);
  });

  it("임의 회사명 → false", () => {
    expect(isExchangeFiled("삼성전자")).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(isExchangeFiled("")).toBe(false);
  });
});

// 거래소 발신 경로는 PATTERNS에 도달하지 않는다는 불변식 회귀 가드.
describe("불변식: 거래소 발신 → MARKET_ACTION | null", () => {
  const CATEGORY_TYPES: DisclosureType[] = [
    DisclosureType.MAJOR_EVENT,
    DisclosureType.FINANCIAL,
    DisclosureType.OWNERSHIP,
    DisclosureType.AUDIT,
    DisclosureType.SHAREHOLDER_MEETING,
  ];

  it.each(EXCHANGE_FILED_SAMPLE)(
    "classifyDisclosure($report_nm, $flr_nm) ∈ { MARKET_ACTION, null }",
    ({ report_nm, flr_nm }) => {
      const result = classifyDisclosure(report_nm, flr_nm);
      expect(result === null || result === DisclosureType.MARKET_ACTION).toBe(true);
      expect(CATEGORY_TYPES).not.toContain(result);
    }
  );

  // 거래정지 공시는 사유 파렌테시스가 PROCEDURAL kw와 겹쳐도 MARKET_ACTION 유지.
  it.each(EXCHANGE_FILED_SAMPLE.filter((s) => s.report_nm.includes("매매거래정지")))(
    "매매거래정지 포함: classifyDisclosure($report_nm, $flr_nm) === MARKET_ACTION",
    ({ report_nm, flr_nm }) => {
      expect(classifyDisclosure(report_nm, flr_nm)).toBe(DisclosureType.MARKET_ACTION);
    }
  );
});

describe("알려진 오분류 (분류기 수정은 별도 트랙, 문서화 전용)", () => {
  for (const seed of MISCLASSIFIED_SEEDS) {
    it.todo(
      `report_nm=${JSON.stringify(seed.report_nm)} → 현재 ${seed.classified} 오분류, 재검토 필요`
    );
  }
});
