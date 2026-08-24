export const DisclosureType = {
  MAJOR_EVENT: "MAJOR_EVENT",
  FINANCIAL: "FINANCIAL",
  OWNERSHIP: "OWNERSHIP",
  AUDIT: "AUDIT",
  SHAREHOLDER_MEETING: "SHAREHOLDER_MEETING",
  MARKET_ACTION: "MARKET_ACTION",
} as const;

export type DisclosureType = (typeof DisclosureType)[keyof typeof DisclosureType];

const EXCHANGE_FILERS = ["코스닥시장본부", "유가증권시장본부"] as const;

// 완전 일치. `코넥스시장`(39건)은 이 집합에 없어 자동 제외 — 의도된 동작.
export const isExchangeFiled = (flrNm: string): boolean =>
  EXCHANGE_FILERS.some((filer) => filer === flrNm);

const PATTERNS: { type: DisclosureType; keywords: string[] }[] = [
  {
    type: DisclosureType.MAJOR_EVENT,
    keywords: [
      "주요사항보고서",
      "증권발행실적보고서",
      "증권발행결과",
      "증권신고서",
      "타법인주식및출자증권취득결정",
      "주식병합결정",
      "단일판매ㆍ공급계약체결",
      "단일판매ㆍ공급계약해지",
      "주식매수선택권부여",
      "주권관련사채권의취득결정",
      "전환가액의조정",
    ],
  },
  {
    type: DisclosureType.FINANCIAL,
    keywords: ["사업보고서", "분기보고서", "반기보고서", "영업(잠정)실적", "결산실적공시예고"],
  },
  {
    type: DisclosureType.OWNERSHIP,
    keywords: ["대량보유상황보고", "소유상황보고", "소유주식변동"],
  },
  {
    type: DisclosureType.AUDIT,
    keywords: ["감사보고서", "내부회계관리제도"],
  },
  {
    type: DisclosureType.SHAREHOLDER_MEETING,
    keywords: ["주주총회", "의결권대리행사권유참고서류", "사외이사의선임ㆍ해임또는중도퇴임"],
  },
];

// 거래소 발신 공시 중 절차적·정기적인 것 — 배지 미부여
const PROCEDURAL_KEYWORDS = [
  "소속부변경",
  "권리락",
  "배당락",
  "약명및영문명",
  "의무보유",
  "변경상장",
  "전자등록 변경",
  "무상증자",
  "자본감소",
  "단일판매공급계약",
  "중요내용공시",
  "합병결정 철회",
  "SPAC",
  "우회상장",
] as const;

// null = 배지 미부여
export const classifyDisclosure = (
  disclosureNm: string,
  flrNm: string,
): DisclosureType | null => {
  if (isExchangeFiled(flrNm)) {
    // 거래정지는 사유(파렌테시스) 불문 주가 관련성 신호 — PROCEDURAL 컷보다 선행.
    if (disclosureNm.includes("매매거래정지")) return DisclosureType.MARKET_ACTION;
    if (PROCEDURAL_KEYWORDS.some((kw) => disclosureNm.includes(kw))) return null;
    return DisclosureType.MARKET_ACTION;
  }

  for (const { type, keywords } of PATTERNS) {
    if (keywords.some((kw) => disclosureNm.includes(kw))) return type;
  }
  return null;
};
