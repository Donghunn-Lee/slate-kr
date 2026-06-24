import { z } from "zod";
import { pool } from "@/lib/db";

const TOKEN_URL = "https://openapi.koreainvestment.com:9443/oauth2/tokenP";

// 폴링 중 만료되는 것을 막기 위한 버퍼(초).
// Neon kis_token.expires_at_ms는 raw 값으로 저장되고, 버퍼는 read 판정 시점에 적용한다.
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

const applyBuffer = (rawExpiresAtMs: number): number => rawExpiresAtMs - EXPIRY_BUFFER_SEC * 1000;

type KisTokenRow = { access_token: string; expires_at_ms: number };

const readSharedToken = async (): Promise<CachedToken | null> => {
  try {
    const [rows] = await pool.query<KisTokenRow[]>(
      "SELECT access_token, expires_at_ms FROM kis_token WHERE id = 1"
    );
    const row = rows[0];
    if (!row) return null;
    return { token: row.access_token, expiresAt: applyBuffer(row.expires_at_ms) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis-token] shared cache read failed: ${message}`);
    return null;
  }
};

const writeSharedToken = async (token: string, rawExpiresAtMs: number): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO kis_token (id, access_token, expires_at_ms, updated_at)
       VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         expires_at_ms = EXCLUDED.expires_at_ms,
         updated_at = now()`,
      [token, rawExpiresAtMs]
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[kis-token] shared cache write failed: ${message}`);
  }
};

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
    const rawExpiresAtMs = Date.now() + expires_in * 1000;

    // 공유 캐시 write-back은 best-effort. 실패해도 발급된 토큰은 그대로 반환한다.
    await writeSharedToken(access_token, rawExpiresAtMs);

    _cached = { token: access_token, expiresAt: applyBuffer(rawExpiresAtMs) };
    return { ok: true, token: access_token };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: "api_error", message } };
  }
};

// 평상시엔 cron(A6-1)이 발급해 둔 Neon kis_token 행을 read만 한다.
// 모듈스코프 _cached는 같은 인스턴스가 매 요청 DB를 때리지 않도록 1차 캐시.
// fallback 발급은 _inflight로 single-flight (인스턴스 내 동시 발급 방지).
// 다중 인스턴스 간 race는 Neon LWW로 허용 — 둘 다 24h 유효라 무해.
export const getKisToken = async (): Promise<TokenResult> => {
  if (isValid(_cached)) {
    return { ok: true, token: _cached.token };
  }

  const shared = await readSharedToken();
  if (isValid(shared)) {
    _cached = shared;
    return { ok: true, token: shared.token };
  }

  if (_inflight) return _inflight;

  _inflight = requestToken().finally(() => {
    _inflight = null;
  });
  return _inflight;
};
