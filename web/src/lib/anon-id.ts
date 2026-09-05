import { cookies } from "next/headers";
import { z } from "zod";

export const ANON_ID_COOKIE = "slatekr_uid";
export const SYNC_MARKER_COOKIE = "slatekr_sync";

const MAX_AGE_SEC = 60 * 60 * 24 * 365;

const anonIdSchema = z.uuid();

export type AnonCookieOptions = {
  path: "/";
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  httpOnly: boolean;
};

export const buildAnonCookieOptions = (
  isProd: boolean,
  httpOnly: boolean
): AnonCookieOptions => ({
  path: "/",
  sameSite: "lax",
  secure: isProd,
  maxAge: MAX_AGE_SEC,
  httpOnly,
});

// 요청 쿠키에서 UUID 읽기. 없거나 UUID 형식이 아니면 null.
// 형식 불일치는 tamper·구버전 잔재로 보고 무시(재발급 하지 않음 — 발급은 PUT lazy).
export const readAnonId = async (): Promise<string | null> => {
  const store = await cookies();
  const raw = store.get(ANON_ID_COOKIE)?.value;
  if (!raw) return null;
  const parsed = anonIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export const writeAnonCookies = async (anonId: string): Promise<void> => {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === "production";

  store.set({
    name: ANON_ID_COOKIE,
    value: anonId,
    ...buildAnonCookieOptions(isProd, true),
  });
  store.set({
    name: SYNC_MARKER_COOKIE,
    value: "1",
    ...buildAnonCookieOptions(isProd, false),
  });
};
