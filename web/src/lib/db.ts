import { neon } from "@neondatabase/serverless";

const INT8_OID = 20;

// fullResults: true 로 컬럼 메타데이터(OID)를 함께 수신
const sql = neon(process.env.DATABASE_URL!, { fullResults: true });

export const pool = {
  query: async <T = unknown[]>(queryStr: string, params?: unknown[]): Promise<[T, unknown]> => {
    const result = await sql.query(queryStr, params);

    // bigint(OID 20) 컬럼 목록 추출
    const bigintCols: string[] = (result.fields as { name: string; dataTypeID: number }[])
      .filter((f) => f.dataTypeID === INT8_OID)
      .map((f) => f.name);

    // bigint 컬럼 값을 Number로 변환 (neon HTTP는 bigint를 string으로 반환)
    if (bigintCols.length > 0) {
      for (const row of result.rows as Record<string, unknown>[]) {
        for (const col of bigintCols) {
          if (typeof row[col] === "string") {
            row[col] = Number(row[col]);
          }
        }
      }
    }

    return [result.rows as T, null];
  },
};
