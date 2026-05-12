import { pool } from "./db";

export type DisclosureSummary = {
  rceptNo: string;
  summaryText: string;
  modelName: string;
  createdAt: Date;
};

export type SaveDisclosureSummaryInput = {
  rceptNo: string;
  summaryText: string;
  modelName: string;
};

type DisclosureSummaryRow = {
  rcept_no: string;
  summary_text: string;
  model_name: string;
  created_at: Date;
};

const normalizeDisclosureSummary = (row: DisclosureSummaryRow): DisclosureSummary => ({
  rceptNo: row.rcept_no,
  summaryText: row.summary_text,
  modelName: row.model_name,
  createdAt: row.created_at,
});

export const getDisclosureSummary = async (rceptNo: string): Promise<DisclosureSummary | null> => {
  const [rows] = await pool.query<DisclosureSummaryRow[]>(
    "SELECT rcept_no, summary_text, model_name, created_at FROM disclosure_summaries WHERE rcept_no = ?",
    [rceptNo]
  );

  if (rows.length === 0) return null;

  return normalizeDisclosureSummary(rows[0]);
};

export const saveDisclosureSummary = async (input: SaveDisclosureSummaryInput): Promise<void> => {
  await pool.query(
    `INSERT INTO disclosure_summaries (rcept_no, summary_text, model_name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       summary_text = VALUES(summary_text),
       model_name   = VALUES(model_name),
       created_at   = CURRENT_TIMESTAMP`,
    [input.rceptNo, input.summaryText, input.modelName]
  );
};
