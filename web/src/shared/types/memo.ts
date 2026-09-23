import { z } from "zod";
import { MarketSchema, TickerSchema } from "./schemas";

export const MAX_MEMO_BODY_LENGTH = 500;
export const MAX_MEMO_COUNT = 200;

export const MemoEntrySchema = z
  .object({
    body: z.string().min(1).max(MAX_MEMO_BODY_LENGTH),
    name: z.string().min(1),
    market: MarketSchema,
    updatedAt: z.string(),
  })
  .strict();

export const MemoSnapshotSchema = z
  .object({
    memos: z
      .record(TickerSchema, MemoEntrySchema)
      .refine(
        (memos) => Object.keys(memos).length <= MAX_MEMO_COUNT,
        { message: `memos exceeds ${MAX_MEMO_COUNT} entries` }
      ),
  })
  .strict();

export type MemoEntry = z.infer<typeof MemoEntrySchema>;
export type MemoSnapshot = z.infer<typeof MemoSnapshotSchema>;

export type AnonMemoRecord = {
  snapshot: MemoSnapshot;
  version: number;
  updatedAt: string;
};

export type MemoGetResponse =
  | { ok: true; data: AnonMemoRecord | null }
  | { ok: false; error: { kind: "db_error" } };

export type MemoPutResponse =
  | { ok: true; data: { version: number; updatedAt: string } }
  | {
      ok: false;
      error: {
        kind: "too_large" | "invalid_json" | "invalid_snapshot" | "db_error";
      };
    };
