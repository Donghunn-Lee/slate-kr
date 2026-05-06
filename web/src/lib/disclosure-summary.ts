import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = "gemini-2.5-flash";

const PROMPT_TEMPLATE = `당신은 한국 상장기업 공시를 일반 투자자에게 풀어 설명하는 도우미입니다.
다음 공시 본문을 요약하세요.

[요약의 목적]
이 공시가 무엇을 알리는 공시인지, 그 사안의 핵심 사실이 무엇인지 전달합니다. 회사 소개, 사업 현황, 연혁, 시장 점유율, 향후 계획 같은 부록 내용은 공시가 알리는 사안과 직접 관련 없으면 다루지 않습니다.

[지켜야 할 원칙]
- 첫 문단 첫 문장은 "이 공시는 ...을(를) 알린다" 형태로, 공시가 알리는 사안 한 가지를 명확히 서술합니다.
- 본문에 있어도 공시 사안과 무관한 회사 소개·사업 보고·연혁·매출 자랑·향후 사업 계획·제품 설명은 다루지 않습니다.
- 본문에 없는 정보(배경, 업계 동향, 다른 사안과의 비교)는 절대 추가하지 않습니다.
- 평가나 전망은 직접 서술하지 않습니다. 본문에 평가·전망이 있더라도 모델 자신의 목소리로 옮기지 말고, 필요하면 "공시는 ~라고 적고 있다"처럼 인용 형태로만 표시합니다.
- "기대된다", "예상된다", "전망이다", "긍정적이다", "부정적이다", "중요하다", "최고의", "선도적인" 같은 평가성 표현은 인용 형태가 아닌 한 사용 금지입니다.
- 숫자(금액, 비율, 주식 수, 일자 등)는 본문 그대로 옮깁니다. 반올림하거나 추정하지 마세요.
- 어려운 용어는 일반 투자자가 이해할 수 있게 풀어 씁니다. 단, 풀어쓸 때도 사실을 바꾸지 마세요. 의미가 모호하면 원문 표현을 유지합니다.

[출력 형식]
- 2~4문단의 자연스러운 한국어 산문. 사안이 단순하면 2문단, 복잡하면 4문단.
- 마크다운 문법(*, #, - 등) 사용 금지
- 각 문단은 빈 줄로 구분
- 서론·결론 표현 없이 바로 본문

[공시 본문]
{text}`;

export type SummarizeResult =
  | { ok: true; summary: string; modelName: string }
  | { ok: false; error: SummarizeError };

export type SummarizeError =
  | { kind: "rate_limit" }
  | { kind: "timeout" }
  | { kind: "safety_blocked" }
  | { kind: "empty_response" }
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

const callGemini = async (text: string): Promise<SummarizeResult> => {
  const ai = getAI();
  const prompt = PROMPT_TEMPLATE.replace("{text}", text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { abortSignal: controller.signal },
    });

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === "SAFETY") {
      return { ok: false, error: { kind: "safety_blocked" } };
    }
    if (response.promptFeedback?.blockReason) {
      return { ok: false, error: { kind: "safety_blocked" } };
    }

    const summary = response.text ?? "";
    if (!summary.trim()) {
      return { ok: false, error: { kind: "empty_response" } };
    }

    return { ok: true, summary: summary.trim(), modelName: MODEL_NAME };
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

export const summarizeDisclosure = async (text: string): Promise<SummarizeResult> => {
  const first = await callGemini(text);
  if (first.ok) return first;

  // 503 일시 과부하 시 1초 대기 후 1회 재시도
  if (!first.ok && first.error.kind === "api_error" && isTransient(first.error.message)) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return callGemini(text);
  }

  return first;
};
