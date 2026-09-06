import { cache } from "react";
import { z } from "zod";
import { pool } from "./db";
import {
  memoSnapshotSchema,
  type AnonMemoRecord,
  type MemoSnapshot,
} from "@/shared/types/memo";

const anonIdSchema = z.uuid();

export type AnonMemoReadResult =
  | { ok: true; data: AnonMemoRecord | null }
  | { ok: false; error: { kind: "db_error" } | { kind: "corrupt" } };

export type AnonMemoWriteResult =
  | { ok: true; data: { version: number; updatedAt: string } }
  | { ok: false; error: { kind: "db_error" } };

type AnonMemoRow = {
  snapshot: unknown;
  version: number;
  updated_at: Date;
};

type UpsertReturningRow = {
  version: number;
  updated_at: Date;
};

// Neon HTTP는 통상 timestamptz를 Date로 반환하지만, 드라이버 경로에 따라 문자열로 올 수 있어
// 두 형태 모두 허용한다. 그 외 값은 corrupt로 취급.
const normalizeUpdatedAt = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  return null;
};

export const parseAnonMemoRow = (row: unknown): AnonMemoRecord | null => {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;

  if (typeof r.version !== "number") return null;
  const updatedAt = normalizeUpdatedAt(r.updated_at);
  if (updatedAt === null) return null;

  const parsed = memoSnapshotSchema.safeParse(r.snapshot);
  if (!parsed.success) return null;

  return {
    snapshot: parsed.data,
    version: r.version,
    updatedAt,
  };
};

export const getAnonMemo = cache(
  async (anonId: string): Promise<AnonMemoReadResult> => {
    anonIdSchema.parse(anonId);

    try {
      const [rows] = await pool.query<AnonMemoRow[]>(
        "SELECT snapshot, version, updated_at FROM anon_memos WHERE anon_id = $1",
        [anonId]
      );
      if (rows.length === 0) return { ok: true, data: null };

      const record = parseAnonMemoRow(rows[0]);
      if (record === null) {
        console.error(`[anon-memo] corrupt snapshot for anon_id=${anonId}`);
        return { ok: false, error: { kind: "corrupt" } };
      }
      return { ok: true, data: record };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[anon-memo] read failed: ${message}`);
      return { ok: false, error: { kind: "db_error" } };
    }
  }
);

export const upsertAnonMemo = async (
  anonId: string,
  snapshot: MemoSnapshot
): Promise<AnonMemoWriteResult> => {
  anonIdSchema.parse(anonId);

  try {
    const [rows] = await pool.query<UpsertReturningRow[]>(
      `INSERT INTO anon_memos (anon_id, snapshot, version, updated_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (anon_id) DO UPDATE SET
         snapshot   = EXCLUDED.snapshot,
         version    = anon_memos.version + 1,
         updated_at = now()
       RETURNING version, updated_at`,
      [anonId, JSON.stringify(snapshot)]
    );

    const row = rows[0];
    const updatedAt = normalizeUpdatedAt(row.updated_at);
    if (updatedAt === null) {
      return { ok: false, error: { kind: "db_error" } };
    }
    return { ok: true, data: { version: row.version, updatedAt } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[anon-memo] upsert failed: ${message}`);
    return { ok: false, error: { kind: "db_error" } };
  }
};
