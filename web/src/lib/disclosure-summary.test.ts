import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeDisclosure, type SummarizeResult } from "./disclosure-summary";

const META = { title: "단일판매ㆍ공급계약체결", corpName: "테스트" };
const CONTENT = { headline: "전동차 공급계약 체결", facts: [], detail: "" };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ok = () =>
  jsonResponse(200, {
    candidates: [
      { content: { role: "model", parts: [{ text: JSON.stringify(CONTENT) }] }, finishReason: "STOP" },
    ],
  });
const unavailable = () =>
  jsonResponse(503, { error: { code: 503, message: "overloaded", status: "UNAVAILABLE" } });
const exhausted = () =>
  jsonResponse(429, { error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } });

// generateContent 호출마다 한 단계씩 소비한다. "hang"은 abort될 때까지 응답하지 않는다.
// afterMs 0은 타이머 없이 응답한다 — backoff 타이머 발화 직후 예약된 0ms 타이머는
// 같은 advanceTimersByTimeAsync 안에서 실행되지 않는다.
type Step = { afterMs: number; respond: () => Response } | "hang";

const scriptFetch = (steps: Step[]) => {
  const callTimes: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      callTimes.push(Date.now());
      const step = steps.shift() ?? "hang";
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("This operation was aborted", "AbortError")),
        );
        if (step === "hang") return;
        if (step.afterMs === 0) resolve(step.respond());
        else setTimeout(() => resolve(step.respond()), step.afterMs);
      });
    }),
  );
  return callTimes;
};

const track = (pending: Promise<SummarizeResult>) => {
  const state: { result: SummarizeResult | null } = { result: null };
  void pending.then((result) => {
    state.result = result;
  });
  return state;
};

describe("summarizeDisclosure 재시도·예산", () => {
  let t0: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    t0 = Date.now();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("503 3회 뒤 성공 — 4번째 시도, 대기 1s·2s·4s", async () => {
    const callTimes = scriptFetch([
      { afterMs: 0, respond: unavailable },
      { afterMs: 0, respond: unavailable },
      { afterMs: 0, respond: unavailable },
      { afterMs: 0, respond: ok },
    ]);
    const state = track(summarizeDisclosure("본문", META));

    await vi.advanceTimersByTimeAsync(6_999);
    expect(callTimes).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);

    expect(state.result).toEqual({ ok: true, content: CONTENT, modelName: expect.any(String), attempts: 4 });
    expect(callTimes.map((t) => t - t0)).toEqual([0, 1_000, 3_000, 7_000]);
  });

  // 54s에 503이 오면 잔여 1s — 다음 backoff 2s를 기다리지 않고 끝낸다.
  it("backoff 뒤 잔여 예산이 5s 미만이면 대기·시도 없이 timeout", async () => {
    const callTimes = scriptFetch([
      { afterMs: 28_000, respond: unavailable },
      { afterMs: 25_000, respond: unavailable },
    ]);
    const state = track(summarizeDisclosure("본문", META));

    await vi.advanceTimersByTimeAsync(53_999);
    expect(state.result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(state.result).toEqual({ ok: false, error: { kind: "timeout" }, attempts: 2 });
    expect(callTimes.map((t) => t - t0)).toEqual([0, 29_000]);
  });

  it("429는 재시도 없이 즉시 rate_limit", async () => {
    const callTimes = scriptFetch([{ afterMs: 0, respond: exhausted }]);
    const state = track(summarizeDisclosure("본문", META));

    await vi.advanceTimersByTimeAsync(0);
    expect(state.result).toEqual({ ok: false, error: { kind: "rate_limit" }, attempts: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callTimes).toHaveLength(1);
  });

  // 두 번째 시도는 29s에 시작해 잔여가 26s — 호출당 30s였다면 59s에 끊긴다.
  it("시도별 timeout을 잔여 예산으로 clamp", async () => {
    const callTimes = scriptFetch([{ afterMs: 28_000, respond: unavailable }, "hang"]);
    const state = track(summarizeDisclosure("본문", META));

    await vi.advanceTimersByTimeAsync(54_999);
    expect(state.result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(state.result).toEqual({ ok: false, error: { kind: "timeout" }, attempts: 2 });
    expect(callTimes.map((t) => t - t0)).toEqual([0, 29_000]);
  });
});
