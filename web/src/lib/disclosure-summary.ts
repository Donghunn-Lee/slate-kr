import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODEL } from "@/shared/constants/gemini";
import {
  DisclosureSummaryContentSchema,
  type DisclosureSummaryContent,
} from "@/shared/types/disclosureSummary";

const PROMPT_TEMPLATE = `당신은 한국 상장기업의 공시 본문을 읽고, 독자가 원문을 읽는 부담을 덜도록 핵심을 정리하는 도우미입니다.
아래 [공시 제목]과 [공시 본문]을 보고 headline · facts · detail 세 필드로 정리하세요.

[근거 원칙]
- 모든 내용의 근거는 본문입니다. 본문에 없는 배경, 업계 동향, 다른 공시·회사와의 비교, 전망은 쓰지 않습니다.
- 본문에 있는 수치·비율·문장을 근거로 한 서술은 씁니다. 직접 계산·환산·추정한 값은 쓰지 않습니다.
- 크기·중요도·평가·전망을 나타내는 판단어(예: 대규모, 핵심적인, 긍정적, 기대된다)는 쓰지 않습니다. 공시 서식명·법정 용어(예: 주요사항보고서, 대규모기업집단)는 예외입니다. 회사가 본문에서 밝힌 목적·평가·전망은 "공시는 ~라고 밝히고 있습니다" 같은 인용 형태로만 옮깁니다.
- 회사 소개, 연혁, 사업 현황, 제품 설명, 향후 계획처럼 이 공시가 알리는 사안과 직접 관련 없는 부록 내용은 다루지 않습니다.

[headline — 사안 식별]
- 이 공시가 알리는 사안 한 가지를 45자 이내 한 문장으로, 명사형으로 끝맺어 씁니다. "이 공시는", "본 공시는" 같은 접두어로 시작하지 않습니다.
- 사안의 종류와 그것을 식별하는 핵심(계약 상대방·대상, 안건, 보고자, 감사의견, 정지 사유 등)을 담습니다. 금액·비율·수량 같은 수치는 facts에 둡니다.
- [회사명]에 적힌 회사의 이름은 넣지 않습니다.
- 제목에 [기재정정]·[첨부정정]이 있으면 정정 공시입니다. headline은 원래 사안에 '정정'과 바뀐 항목을 붙여 씁니다(예: 임시주주총회 소집 결의 정정 — 일시·이사 후보 변경).
- 예: "○○와 전동차 공급계약 체결", "임시주주총회 소집 결의 — 정관 변경·이사 선임", "2025 사업연도 감사보고서 제출 — 감사의견 적정"

[facts — 핵심 항목 표]
- 사안의 규모·시점·당사자·조건을 파악하는 데 필요한 항목을 label/value 쌍으로 넣습니다. 우선순위: 규모(금액·수량·비율) → 시점(일자·기간) → 당사자(상대방·대상·보고자) → 조건.
- label은 10자 이내입니다. 본문 용어를 쓰되 길면 의미를 유지한 채 줄여 씁니다. label에 붙은 단위((원)·(%)·(주) 등)는 value 끝에 붙입니다(예: 매출액대비(%) 5.9 → 매출액 대비 / 5.9%).
- value는 본문 표기를 단위까지 그대로 옮깁니다. 반올림·환산·추정·풀어쓰기를 하지 않습니다. 통화가 둘 이상 병기돼 있으면 모두 옮깁니다. 날짜만 [표기]의 날짜 규칙을 따릅니다.
- 최대 18개. 값이 같거나 의미가 겹치는 항목은 하나만 넣습니다. 본문에 해당 정보가 없으면 빈 배열로 둡니다.
- [회사명]에 적힌 회사의 이름을 항목으로 넣지 않습니다(주소·종목명처럼 다른 값의 일부로 들어가는 것은 괜찮습니다). 계약 상대방·취득 대상·보고자 같은 다른 주체는 넣습니다.

[detail — 표 밖의 근거·조건·절차]
- facts에 넣은 값의 산정 근거(적용 환율, 비율의 기준 연도 등), 조건·전제(조정 조건, 이행 조건, 해제 조건), 절차(의결권 행사 방법·기한, 납입·청구 기간의 운용), 정정 공시라면 무엇이 어떻게 바뀌었는지를 씁니다.
- facts의 값을 다시 쓰지 않습니다. 값 대신 그 값이 성립하는 근거·조건을 씁니다. headline을 풀어 쓰기만 하는 문장도 쓰지 않습니다.
- 어려운 용어는 사실을 바꾸지 않는 범위에서 풀어 씁니다. 의미가 모호하면 본문 표현을 유지합니다.
- 쓸 내용이 있으면 2~6문장, 없으면 빈 문자열("")을 반환합니다. 분량을 채우려고 억지로 쓰지 않습니다.
- 마크다운 문법(*, #, -)을 쓰지 않습니다. 문단을 나눌 때는 빈 줄 하나로 구분합니다.

[표기]
- detail은 "~습니다" 체 존댓말로 통일합니다. headline은 명사형으로 끝냅니다. facts의 value는 본문 표기입니다.
- 날짜는 "YYYY년 M월 D일"로 표기합니다. 값은 바꾸지 않습니다. 시각은 본문 표기를 유지합니다(예: 오전 9시).
- 숫자는 본문의 자릿수·단위 그대로 옮깁니다(예: 1,200억원, 6.66%, 560,852주).

[회사명]
{corpName}

[공시 제목]
{title}

[공시 본문]
{text}`;

// z.toJSONSchema()가 emit하지 않는 non-standard propertyOrdering을
// object-type 노드마다 주입한다 (Gemini의 필드 순서 힌트).
// $schema 필드는 SDK responseJsonSchema 지원 목록에 없어 제거한다.
const buildResponseJsonSchema = (): unknown => {
  const raw = z.toJSONSchema(DisclosureSummaryContentSchema) as Record<string, unknown>;
  const injectOrdering = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    const obj = node as Record<string, unknown>;
    if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
      const props = obj.properties as Record<string, unknown>;
      obj.propertyOrdering = Object.keys(props);
      for (const key of Object.keys(props)) {
        injectOrdering(props[key]);
      }
    }
    if (obj.type === "array" && obj.items) {
      injectOrdering(obj.items);
    }
    return obj;
  };
  injectOrdering(raw);
  delete raw["$schema"];
  return raw;
};

const RESPONSE_JSON_SCHEMA = buildResponseJsonSchema();

type CallResult =
  | { ok: true; content: DisclosureSummaryContent; modelName: string }
  | { ok: false; error: SummarizeError };

export type SummarizeResult = CallResult & { attempts: number };

export type SummarizeError =
  | { kind: "rate_limit" }
  | { kind: "timeout" }
  | { kind: "safety_blocked" }
  | { kind: "empty_response" }
  | { kind: "parse_failed" }
  | { kind: "api_error"; message: string }
  | { kind: "not_summarizable" };

let _ai: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  if (_ai) return _ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
};

const isTransient = (message: string): boolean =>
  message.includes("503") || message.includes("UNAVAILABLE");

// 재시도·대기까지 포함한 요청 전체 예산. route maxDuration(60s) 안에 끝나야 한다.
const SUMMARY_BUDGET_MS = 55_000;
const CALL_TIMEOUT_MS = 30_000;
// 잔여 예산이 이보다 짧으면 응답을 받기 전에 끊길 가능성이 커서 시도하지 않는다.
const MIN_ATTEMPT_MS = 5_000;
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000] as const;

type SummarizeMeta = { title: string; corpName: string };

const callGemini = async (
  text: string,
  { title, corpName }: SummarizeMeta,
  timeoutMs: number
): Promise<CallResult> => {
  const ai = getAI();
  // 한 번에 치환해야 넣은 값 속의 {text} 같은 문자열이 다시 치환되지 않는다.
  // 문자열 치환값은 $&·$`·$$ 를 치환 패턴으로 해석하므로 함수로 넘긴다.
  const values: Record<string, string> = { corpName, title, text };
  const prompt = PROMPT_TEMPLATE.replace(
    /\{(corpName|title|text)\}/g,
    (_, key: string) => values[key]
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        abortSignal: controller.signal,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
      },
    });

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === "SAFETY") {
      return { ok: false, error: { kind: "safety_blocked" } };
    }
    if (response.promptFeedback?.blockReason) {
      return { ok: false, error: { kind: "safety_blocked" } };
    }

    const raw = response.text ?? "";
    if (!raw.trim()) {
      return { ok: false, error: { kind: "empty_response" } };
    }

    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[disclosure-summary] JSON.parse failed: ${message}`);
      return { ok: false, error: { kind: "parse_failed" } };
    }

    const parsed = DisclosureSummaryContentSchema.safeParse(jsonValue);
    if (!parsed.success) {
      console.error(
        `[disclosure-summary] schema validation failed: ${parsed.error.message}`,
      );
      return { ok: false, error: { kind: "parse_failed" } };
    }

    return { ok: true, content: parsed.data, modelName: GEMINI_MODEL };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { kind: "timeout" } };
    }

    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
      return { ok: false, error: { kind: "rate_limit" } };
    }

    return { ok: false, error: { kind: "api_error", message } };
  } finally {
    clearTimeout(timer);
  }
};

export const summarizeDisclosure = async (
  text: string,
  meta: SummarizeMeta
): Promise<SummarizeResult> => {
  const deadline = Date.now() + SUMMARY_BUDGET_MS;
  const attempt = () =>
    callGemini(text, meta, Math.min(CALL_TIMEOUT_MS, deadline - Date.now()));

  let result = await attempt();
  let attempts = 1;

  // 503 일시 과부하만 backoff 후 재시도한다. 429는 쿼터 소진이라 재시도해도 같은 응답이다.
  for (const backoffMs of RETRY_BACKOFF_MS) {
    if (result.ok || result.error.kind !== "api_error" || !isTransient(result.error.message)) {
      break;
    }
    if (deadline - Date.now() - backoffMs < MIN_ATTEMPT_MS) {
      return { ok: false, error: { kind: "timeout" }, attempts };
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    result = await attempt();
    attempts++;
  }

  return { ...result, attempts };
};
