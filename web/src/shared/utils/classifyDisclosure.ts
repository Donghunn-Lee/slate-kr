export const DisclosureType = {
  MAJOR_EVENT: "MAJOR_EVENT",
  FINANCIAL: "FINANCIAL",
  OWNERSHIP: "OWNERSHIP",
  AUDIT: "AUDIT",
  SHAREHOLDER_MEETING: "SHAREHOLDER_MEETING",
} as const;

export type DisclosureType = (typeof DisclosureType)[keyof typeof DisclosureType];

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

// null = 행정성 공시, 태그 없음
export const classifyDisclosure = (title: string): DisclosureType | null => {
  for (const { type, keywords } of PATTERNS) {
    if (keywords.some((kw) => title.includes(kw))) return type;
  }
  return null;
};
