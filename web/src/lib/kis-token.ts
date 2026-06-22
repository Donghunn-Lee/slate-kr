import { z } from "zod";

const TOKEN_URL = "https://openapi.koreainvestment.com:9443/oauth2/tokenP";

// 만료 직전 토큰으로 폴링 중 만료되는 것을 막기 위한 버퍼(초)
const EXPIRY_BUFFER_SEC = 600;

const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.coerce.number(),
});

export type TokenResult = { ok: true; token: string } | { ok: false; error: TokenError };

export type TokenError =
  | { kind: "missing_credentials" }
  | { kind: "rate_limit" } // 1분 1회 발급 제한(EGW 계열)
  | { kind: "api_error"; message: string };

type CachedToken = {
  token: string;
  expiresAt: number; // epoch ms (버퍼 적용 후)
};

let _cached: CachedToken | null = null;
let _inflight: Promise<TokenResult> | null = null;

const isValid = (c: CachedToken | null): c is CachedToken => c !== null && Date.now() < c.expiresAt;

const requestToken = async (): Promise<TokenResult> => {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    return { ok: false, error: { kind: "missing_credentials" } };
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: appKey,
        appsecret: appSecret,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      // 1분 1회 제한 초과는 KIS가 본문 코드로 안내(EGW00133 등)
      if (res.status === 403 || body.includes("EGW")) {
        return { ok: false, error: { kind: "rate_limit" } };
      }
      return {
        ok: false,
        error: { kind: "api_error", message: `HTTP ${res.status}: ${body.slice(0, 200)}` },
      };
    }

    const json: unknown = await res.json();
    const parsed = TokenResponseSchema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, error: { kind: "api_error", message: "토큰 응답 파싱 실패" } };
    }

    const { access_token, expires_in } = parsed.data;
    _cached = {
      token: access_token,
      expiresAt: Date.now() + (expires_in - EXPIRY_BUFFER_SEC) * 1000,
    };
    return { ok: true, token: access_token };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: "api_error", message } };
  }
};

// 동시 호출 시 진행 중인 발급 Promise를 공유한다(중복 발급 방지).
export const getKisToken = async (): Promise<TokenResult> => {
  if (isValid(_cached)) {
    return { ok: true, token: _cached.token };
  }

  if (_inflight) return _inflight;

  _inflight = requestToken().finally(() => {
    _inflight = null;
  });
  return _inflight;
};
