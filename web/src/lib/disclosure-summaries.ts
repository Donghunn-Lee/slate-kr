import { pool } from "./db";
import {
  DisclosureSummaryContentSchema,
  type DisclosureSummaryContent,
} from "@/shared/types/disclosureSummary";

export type DisclosureSummary = {
  rceptNo: string;
  content: DisclosureSummaryContent;
  modelName: string;
  createdAt: Date;
};

export type SaveDisclosureSummaryInput = {
  rceptNo: string;
  content: DisclosureSummaryContent;
  modelName: string;
};

type DisclosureSummaryRow = {
  rcept_no: string;
  summary_text: string;
  model_name: string;
  created_at: Date;
};

// summary_text는 JSON.stringify(content)로 저장된 문자열이다.
// 구 포맷(줄글) 또는 스키마 미일치 레코드는 null 반환 = 캐시 미스 → 재생성.
const normalizeDisclosureSummary = (row: DisclosureSummaryRow): DisclosureSummary | null => {
  let jsonValue: unknown;
  try {
    jsonValue = JSON.parse(row.summary_text);
  } catch {
    return null;
  }

  const parsed = DisclosureSummaryContentSchema.safeParse(jsonValue);
  if (!parsed.success) return null;

  return {
    rceptNo: row.rcept_no,
    content: parsed.data,
    modelName: row.model_name,
    createdAt: row.created_at,
  };
};

export const getDisclosureSummary = async (rceptNo: string): Promise<DisclosureSummary | null> => {
  const [rows] = await pool.query<DisclosureSummaryRow[]>(
    "SELECT rcept_no, summary_text, model_name, created_at FROM disclosure_summaries WHERE rcept_no = $1",
    [rceptNo]
  );

  if (rows.length === 0) return null;

  return normalizeDisclosureSummary(rows[0]);
};

export const saveDisclosureSummary = async (input: SaveDisclosureSummaryInput): Promise<void> => {
  await pool.query(
    `INSERT INTO disclosure_summaries (rcept_no, summary_text, model_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (rcept_no) DO UPDATE SET
       summary_text = EXCLUDED.summary_text,
       model_name   = EXCLUDED.model_name,
       created_at   = NOW()`,
    [input.rceptNo, JSON.stringify(input.content), input.modelName]
  );
};
