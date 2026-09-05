import { z } from "zod";
import { MAX_WATCHLIST_SIZE } from "@/features/watchlist/store/watchlistSnapshot";

const marketSchema = z.enum(["KOSPI", "KOSDAQ"]);
const tickerSchema = z.string().regex(/^[0-9A-Z]{6}$/);

export const watchlistGroupSchema = z
  .object({
    id: z.uuid(),
    name: z.string().max(100),
    order: z.number().int(),
    createdAt: z.number().int(),
  })
  .strict();

export const membershipSchema = z
  .object({
    groupId: z.uuid(),
    ticker: tickerSchema,
    addedAt: z.number().int(),
    order: z.number().int(),
  })
  .strict();

export const stockMetaSchema = z
  .object({
    name: z.string().max(100),
    market: marketSchema,
  })
  .strict();

export const watchlistSnapshotSchema = z
  .object({
    groups: z.array(watchlistGroupSchema),
    memberships: z.array(membershipSchema).max(MAX_WATCHLIST_SIZE),
    stockMeta: z.record(tickerSchema, stockMetaSchema),
  })
  .strict();

export type WatchlistGroup = z.infer<typeof watchlistGroupSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type StockMeta = z.infer<typeof stockMetaSchema>;
export type WatchlistSnapshot = z.infer<typeof watchlistSnapshotSchema>;

export type AnonWatchlistRecord = {
  snapshot: WatchlistSnapshot;
  version: number;
  updatedAt: string;
};

export type WatchlistGetResponse =
  | { ok: true; data: AnonWatchlistRecord | null }
  | { ok: false; error: { kind: "db_error" } };

export type WatchlistPutResponse =
  | { ok: true; data: { version: number; updatedAt: string } }
  | {
      ok: false;
      error: {
        kind: "too_large" | "invalid_json" | "invalid_snapshot" | "db_error";
      };
    };
