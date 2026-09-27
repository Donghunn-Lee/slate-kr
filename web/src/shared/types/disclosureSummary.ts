import { z } from "zod";

export const DisclosureSummaryFactSchema = z.object({
  label: z.string().describe("항목 이름(10자 이내)"),
  value: z.string().describe("항목 값"),
});

export const DisclosureSummaryContentSchema = z.object({
  headline: z.string().describe("이 공시가 알리는 사안 한 문장(45자 이내)"),
  facts: z.array(DisclosureSummaryFactSchema).max(18).describe("핵심 항목 표(최대 18개)"),
  detail: z.string().describe("표 밖의 근거·조건·절차 산문. 없으면 빈 문자열"),
});

export type DisclosureSummaryFact = z.infer<typeof DisclosureSummaryFactSchema>;
export type DisclosureSummaryContent = z.infer<typeof DisclosureSummaryContentSchema>;
