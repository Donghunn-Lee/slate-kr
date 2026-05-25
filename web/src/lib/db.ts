import { neon } from "@neondatabase/serverless";

const INT8_OID = 20; // bigint
const NUMERIC_OID = 1700; // numeric / decimal
// Note: 큰 numeric 값(15자리 초과)이 필요한 컬럼이 추가되면 BigInt 또는 string 유지 검토

// fullResults: true 로 컬럼 메타데이터(OID)를 함께 수신
const sql = neon(process.env.DATABASE_URL!, { fullResults: true });

export const pool = {
  query: async <T = unknown[]>(queryStr: string, params?: unknown[]): Promise<[T, unknown]> => {
    const result = await sql.query(queryStr, params);

    // bigint(OID 20) 및 numeric(OID 1700) 컬럼 목록 추출
    // neon HTTP는 두 타입 모두 string으로 반환
    const strCols: string[] = (result.fields as { name: string; dataTypeID: number }[])
      .filter((f) => f.dataTypeID === INT8_OID || f.dataTypeID === NUMERIC_OID)
      .map((f) => f.name);

    if (strCols.length > 0) {
      for (const row of result.rows as Record<string, unknown>[]) {
        for (const col of strCols) {
          if (typeof row[col] === "string") {
            row[col] = Number(row[col]);
          }
        }
      }
    }

    return [result.rows as T, null];
  },
};
