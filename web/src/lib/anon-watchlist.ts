import { cache } from "react";
import { z } from "zod";
import { pool } from "./db";
import {
  watchlistSnapshotSchema,
  type WatchlistSnapshot,
} from "@/shared/types/watchlist";

const anonIdSchema = z.uuid();

export type AnonWatchlistRecord = {
  snapshot: WatchlistSnapshot;
  version: number;
  updatedAt: string; // ISO
};

export type AnonWatchlistReadResult =
  | { ok: true; data: AnonWatchlistRecord | null }
  | { ok: false; error: { kind: "db_error" } | { kind: "corrupt" } };

export type AnonWatchlistWriteResult =
  | { ok: true; data: { version: number; updatedAt: string } }
  | { ok: false; error: { kind: "db_error" } };

type AnonWatchlistRow = {
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

export const parseAnonWatchlistRow = (row: unknown): AnonWatchlistRecord | null => {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;

  if (typeof r.version !== "number") return null;
  const updatedAt = normalizeUpdatedAt(r.updated_at);
  if (updatedAt === null) return null;

  const parsed = watchlistSnapshotSchema.safeParse(r.snapshot);
  if (!parsed.success) return null;

  return {
    snapshot: parsed.data,
    version: r.version,
    updatedAt,
  };
};

export const getAnonWatchlist = cache(
  async (anonId: string): Promise<AnonWatchlistReadResult> => {
    anonIdSchema.parse(anonId);

    try {
      const [rows] = await pool.query<AnonWatchlistRow[]>(
        "SELECT snapshot, version, updated_at FROM anon_watchlists WHERE anon_id = $1",
        [anonId]
      );
      if (rows.length === 0) return { ok: true, data: null };

      const record = parseAnonWatchlistRow(rows[0]);
      if (record === null) {
        console.error(`[anon-watchlist] corrupt snapshot for anon_id=${anonId}`);
        return { ok: false, error: { kind: "corrupt" } };
      }
      return { ok: true, data: record };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[anon-watchlist] read failed: ${message}`);
      return { ok: false, error: { kind: "db_error" } };
    }
  }
);

export const upsertAnonWatchlist = async (
  anonId: string,
  snapshot: WatchlistSnapshot
): Promise<AnonWatchlistWriteResult> => {
  anonIdSchema.parse(anonId);

  try {
    const [rows] = await pool.query<UpsertReturningRow[]>(
      `INSERT INTO anon_watchlists (anon_id, snapshot, version, updated_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (anon_id) DO UPDATE SET
         snapshot   = EXCLUDED.snapshot,
         version    = anon_watchlists.version + 1,
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
    console.error(`[anon-watchlist] upsert failed: ${message}`);
    return { ok: false, error: { kind: "db_error" } };
  }
};
