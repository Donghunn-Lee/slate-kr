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
    keywords: ["주요사항보고서"],
  },
  {
    type: DisclosureType.FINANCIAL,
    keywords: ["사업보고서", "분기보고서", "반기보고서"],
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
    keywords: ["주주총회"],
  },
];

// null = 행정성 공시, 태그 없음
export const classifyDisclosure = (title: string): DisclosureType | null => {
  for (const { type, keywords } of PATTERNS) {
    if (keywords.some((kw) => title.includes(kw))) return type;
  }
  return null;
};
