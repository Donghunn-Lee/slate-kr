import { describe, it, expect } from "vitest";
import { classifyDisclosure, isExchangeFiled, DisclosureType } from "@/shared/utils/classifyDisclosure";
import {
  CURATED_CASES,
  EXCHANGE_FILED_SAMPLE,
  MISCLASSIFIED_SEEDS,
} from "./classifyDisclosure.fixtures";

// 필드 매핑 어댑터: DART 원본은 snake_case(report_nm/flr_nm), classifyDisclosure는
// camelCase(disclosureNm/flrNm) 인자를 받는다. 픽스처는 원본 형태를 유지하므로
// 호출부에서 어댑터 방식으로 매핑한다.

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

  // 회귀 가드: 코넥스시장은 EXCHANGE_FILERS 집합에서 의도적으로 제외 (raw.json 39건).
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

describe("불변식: 거래소 발신 → MARKET_ACTION | null", () => {
  // 거래소 발신 경로는 구조상 PATTERNS(MAJOR_EVENT/FINANCIAL/OWNERSHIP/AUDIT/SHAREHOLDER_MEETING)에
  // 도달 불가. 리팩토링 회귀 가드.
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
});

describe("알려진 오분류 (D트랙 backlog, 문서화 전용)", () => {
  // 현재 분류기는 report_nm에 카테고리 키워드가 우연히 substring으로 포함되면
  // 회사 발신 경로에서 오분류한다. 아래는 raw.json classifierMisclassified 시드.
  // 분류기 수정은 별도 트랙 — 여기서는 it.todo 로 문서화만.
  for (const seed of MISCLASSIFIED_SEEDS) {
    it.todo(
      `report_nm=${JSON.stringify(seed.report_nm)} → 현재 ${seed.classified} 오분류, 재검토 필요`
    );
  }
});
