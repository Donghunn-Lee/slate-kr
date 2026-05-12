import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export const pool = {
  query: async <T = unknown[]>(queryStr: string, params?: unknown[]): Promise<[T, unknown]> => {
    const rows = (await sql.query(queryStr, params)) as T;
    return [rows, null];
  },
};
