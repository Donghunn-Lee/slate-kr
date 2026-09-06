import { z } from "zod";

const marketSchema = z.enum(["KOSPI", "KOSDAQ"]);
const tickerSchema = z.string().regex(/^[0-9A-Z]{6}$/);

export const MAX_MEMO_BODY_LENGTH = 500;
export const MAX_MEMO_COUNT = 200;

export const memoEntrySchema = z
  .object({
    body: z.string().min(1).max(MAX_MEMO_BODY_LENGTH),
    name: z.string().min(1),
    market: marketSchema,
    updatedAt: z.string(),
  })
  .strict();

export const memoSnapshotSchema = z
  .object({
    memos: z
      .record(tickerSchema, memoEntrySchema)
      .refine(
        (memos) => Object.keys(memos).length <= MAX_MEMO_COUNT,
        { message: `memos exceeds ${MAX_MEMO_COUNT} entries` }
      ),
  })
  .strict();

export type MemoEntry = z.infer<typeof memoEntrySchema>;
export type MemoSnapshot = z.infer<typeof memoSnapshotSchema>;

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
