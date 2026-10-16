// The only path AI-generated SQL takes to the database.
//
// Three layers, so no single bug opens a hole:
//   1. The database role (002_readonly_role.sql) can only SELECT demo tables,
//      every transaction is read-only, and statements die after 5 seconds.
//   2. This helper runs the query inside a READ ONLY transaction, re-applies
//      the timeout, and uses the extended protocol, which rejects stacked
//      statements such as "select 1; drop table partners".
//   3. The query is wrapped as a subquery with a LIMIT, which caps rows at
//      500 and turns anything that is not a SELECT into a syntax error.
import type pg from "pg";
import { connect } from "./client.ts";

export const ROW_CAP = 500;
export const STATEMENT_TIMEOUT_MS = 5_000;

export interface ReadOnlyResult {
  columns: string[];
  rows: Record<string, unknown>[];
  /** True when the query matched more than ROW_CAP rows and was cut off. */
  truncated: boolean;
}

export async function runReadOnlyQuery(sql: string, client?: pg.Client): Promise<ReadOnlyResult> {
  const body = sql.trim().replace(/;\s*$/, "");
  const db = client ?? (await connect(process.env.READONLY_DATABASE_URL, "READONLY_DATABASE_URL"));
  try {
    await db.query("begin transaction read only");
    await db.query(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    // Fetch one extra row so we can tell the caller the result was capped.
    const result = await db.query({
      text: `select * from (\n${body}\n) as capped limit ${ROW_CAP + 1}`,
      queryMode: "extended",
    } as pg.QueryConfig);
    await db.query("commit");
    return {
      columns: result.fields.map((f) => f.name),
      rows: result.rows.slice(0, ROW_CAP),
      truncated: result.rows.length > ROW_CAP,
    };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    if (!client) await db.end();
  }
}
