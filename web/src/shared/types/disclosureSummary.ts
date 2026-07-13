import { z } from "zod";

export const DisclosureSummaryFactSchema = z.object({
  label: z
    .string()
    .describe(
      "항목 이름. 공시 본문에 쓰인 용어를 그대로 사용합니다 (예: 계약금액, 납입일, 취득주식수, 보고자). 10자 이내.",
    ),
  value: z
    .string()
    .describe(
      '본문의 숫자·명칭을 단위까지 포함해 그대로 옮깁니다 (예: "1,200억원", "6.66%", "560,852주"). 반올림·추정·단위 환산 금지. 원문의 자릿수를 그대로 유지합니다. 날짜는 표기만 "YYYY년 M월 D일" 형태로 통일합니다. 날짜의 값 자체는 바꾸지 않습니다.',
    ),
});

export const DisclosureSummaryContentSchema = z.object({
  headline: z
    .string()
    .describe(
      '공시가 알리는 사안 한 가지를 "이 공시는 ...을(를) 알립니다" 형태의 한 문장으로 서술합니다. 45자 이내. 두 문장 이상 쓰지 않습니다. 구체적인 수치는 facts에 넣고 headline에는 넣지 않습니다.',
    ),
  facts: z
    .array(DisclosureSummaryFactSchema)
    .max(8)
    .describe(
      "공시 본문에 나온 핵심 항목. 사안의 규모·시점·당사자를 파악하는 데 필요한 것을 우선합니다. 최대 8개. 본문에 해당 정보가 없으면 빈 배열로 둡니다. 억지로 채우지 않습니다. 값이 같거나 의미가 겹치는 항목을 중복해서 넣지 않습니다. 이 공시를 제출한 회사 자신의 이름은 넣지 않습니다. 단, 계약 상대방·취득 대상·보고자처럼 다른 주체의 이름은 넣습니다.",
    ),
  detail: z
    .string()
    .describe(
      'facts에 담기지 않은 맥락·조건·전제를 1~2문단의 한국어 산문으로 서술합니다. "~습니다" 체로 씁니다. facts에 이미 넣은 내용을 반복하지 않습니다. headline을 풀어 쓰기만 하는 문장은 쓰지 않습니다. 추가할 내용이 없으면 빈 문자열("")을 반환합니다. 분량을 채우려고 억지로 쓰지 않습니다. 마크다운 문법(*, #, - 등) 사용 금지. 문단은 빈 줄로 구분합니다.',
    ),
});

export type DisclosureSummaryFact = z.infer<typeof DisclosureSummaryFactSchema>;
export type DisclosureSummaryContent = z.infer<typeof DisclosureSummaryContentSchema>;
