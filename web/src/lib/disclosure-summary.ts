import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = "gemini-2.5-flash";

export type SummarizeResult =
  | { ok: true; summary: string; modelName: string }
  | { ok: false; error: SummarizeError };

export type SummarizeError =
  | { kind: "rate_limit" }
  | { kind: "timeout" }
  | { kind: "safety_blocked" }
  | { kind: "empty_response" }
  | { kind: "api_error"; message: string };

let _ai: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  if (_ai) return _ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
};

export const summarizeDisclosure = async (text: string): Promise<SummarizeResult> => {
  const ai = getAI();

  const prompt = `다음 공시 본문을 3줄로 요약해줘.\n본문:\n${text}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { abortSignal: controller.signal },
    });

    // 안전 필터 차단 확인
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
