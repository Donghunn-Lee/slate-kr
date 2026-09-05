import {
  watchlistSnapshotSchema,
  type WatchlistSnapshot,
} from "@/shared/types/watchlist";

const MAX_BODY_BYTES = 64 * 1024;

export type ParsePutBodyResult =
  | { ok: true; snapshot: WatchlistSnapshot }
  | { ok: false; status: 400; kind: "invalid_json" | "invalid_snapshot" }
  | { ok: false; status: 413; kind: "too_large" };

export const parsePutBody = (text: string): ParsePutBodyResult => {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, kind: "too_large" };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, kind: "invalid_json" };
  }

  const parsed = watchlistSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, status: 400, kind: "invalid_snapshot" };
  }

  return { ok: true, snapshot: parsed.data };
};
