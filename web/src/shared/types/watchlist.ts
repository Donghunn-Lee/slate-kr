import { z } from "zod";
import { MarketSchema, TickerSchema } from "./schemas";
import { MAX_WATCHLIST_SIZE } from "@/features/watchlist/store/watchlistSnapshot";

export const MAX_GROUP_NAME_LENGTH = 100;

export const WatchlistGroupSchema = z
  .object({
    id: z.uuid(),
    name: z.string().max(MAX_GROUP_NAME_LENGTH),
    order: z.number().int(),
    createdAt: z.number().int(),
  })
  .strict();

export const MembershipSchema = z
  .object({
    groupId: z.uuid(),
    ticker: TickerSchema,
    addedAt: z.number().int(),
    order: z.number().int(),
  })
  .strict();

export const StockMetaSchema = z
  .object({
    name: z.string().max(100),
    market: MarketSchema,
  })
  .strict();

export const WatchlistSnapshotSchema = z
  .object({
    groups: z.array(WatchlistGroupSchema),
    memberships: z.array(MembershipSchema).max(MAX_WATCHLIST_SIZE),
    stockMeta: z.record(TickerSchema, StockMetaSchema),
  })
  .strict();

export type WatchlistGroup = z.infer<typeof WatchlistGroupSchema>;
export type Membership = z.infer<typeof MembershipSchema>;
export type StockMeta = z.infer<typeof StockMetaSchema>;
export type WatchlistSnapshot = z.infer<typeof WatchlistSnapshotSchema>;

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
