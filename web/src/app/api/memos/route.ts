import { type NextRequest, NextResponse } from "next/server";
import { readAnonId, writeAnonCookies } from "@/lib/anon-id";
import { getAnonMemo, upsertAnonMemo } from "@/lib/anon-memo";
import { parsePutBody } from "@/lib/parsePutBody";
import {
  memoSnapshotSchema,
  type MemoGetResponse,
  type MemoPutResponse,
} from "@/shared/types/memo";

export const dynamic = "force-dynamic";

// 사용자별 데이터라 CDN·브라우저 캐시 금지. Set-Cookie 응답도 캐시되면 다른 사용자에게 새는 것을 방지.
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

const json = <T>(body: T, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS });

export const GET = async () => {
  const anonId = await readAnonId();
  if (!anonId) {
    return json<MemoGetResponse>({ ok: true, data: null });
  }

  const result = await getAnonMemo(anonId);
  if (result.ok) {
    return json<MemoGetResponse>({ ok: true, data: result.data });
  }
  // corrupt 는 클라이언트가 로컬 스냅샷으로 덮어써 자가 치유. null 로 응답.
  if (result.error.kind === "corrupt") {
    return json<MemoGetResponse>({ ok: true, data: null });
  }
  return json<MemoGetResponse>(
    { ok: false, error: { kind: "db_error" } },
    503
  );
};

export const PUT = async (req: NextRequest) => {
  const text = await req.text();
  const parsed = parsePutBody(text, memoSnapshotSchema);
  if (!parsed.ok) {
    return json<MemoPutResponse>(
      { ok: false, error: { kind: parsed.kind } },
      parsed.status
    );
  }

  const existing = await readAnonId();
  const anonId = existing ?? crypto.randomUUID();

  const result = await upsertAnonMemo(anonId, parsed.snapshot);
  if (!result.ok) {
    return json<MemoPutResponse>(
      { ok: false, error: { kind: "db_error" } },
      503
    );
  }

  // 신규·기존 무관하게 매번 set — Max-Age rolling 갱신.
  await writeAnonCookies(anonId);
  return json<MemoPutResponse>({ ok: true, data: result.data });
};
