// Checks the Foundation's "done when" list in one command (npm run db:verify):
//   1. Row counts and content fingerprints match the committed snapshot,
//      so two seeds produce the same database row for row.
//   2. The read-only role can read, and cannot write, escalate or stall.
//   3. The data dictionary documents every column in the database.
// Pass --update-snapshot after an intentional change to the generator.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { connect } from "./db/client.ts";
import { ROW_CAP, runReadOnlyQuery } from "./db/readonly.ts";

const SNAPSHOT = fileURLToPath(new URL("./db/snapshot.json", import.meta.url));
const DICTIONARY = fileURLToPath(new URL("./docs/data-dictionary.md", import.meta.url));

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function expectError(db: pg.Client, sql: string, label: string, codes: string[]): Promise<void> {
  try {
    await db.query(sql);
    check(false, label, "query succeeded");
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    check(codes.includes(code), label, `${code} ${(error as Error).message}`);
  }
}

async function expectHelperError(db: pg.Client, sql: string, label: string): Promise<void> {
  try {
    await runReadOnlyQuery(sql, db);
    check(false, label, "query succeeded");
  } catch (error) {
    check(true, label, (error as Error).message);
  }
}

// ---------------------------------------------------------------------------

async function tableFingerprints(admin: pg.Client): Promise<Record<string, { rows: number; md5: string }>> {
  const { rows: tables } = await admin.query<{ schema: string; name: string }>(
    `select table_schema as schema, table_name as name from information_schema.tables
     where table_schema in ('ecosystem', 'eval') and table_type = 'BASE TABLE' and table_name <> 'agent_runs'
     order by 1, 2`,
  );
  // Timestamps render in the session time zone; pin it so fingerprints are stable.
  await admin.query("set timezone = 'UTC'");
  const out: Record<string, { rows: number; md5: string }> = {};
  for (const { schema, name } of tables) {
    // _eval_tags has a serial id, but its content order is fixed by the seed.
    const { rows } = await admin.query(
      `select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as md5
       from ${schema}.${name} t`,
    );
    out[`${schema}.${name}`] = { rows: rows[0].n, md5: rows[0].md5 };
  }
  return out;
}

async function checkDeterminism(admin: pg.Client): Promise<void> {
  console.log("\nDeterminism");
  const current = await tableFingerprints(admin);
  for (const [table, { rows }] of Object.entries(current)) console.log(`      ${table.padEnd(32)} ${rows.toLocaleString("en-US")}`);

  if (process.argv.includes("--update-snapshot") || !existsSync(SNAPSHOT)) {
    writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2) + "\n");
    console.log(`      wrote ${relative(process.cwd(), SNAPSHOT)}; re-seed and run again to compare`);
    return;
  }
  const expected = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as typeof current;
  for (const table of Object.keys({ ...expected, ...current })) {
    const a = expected[table];
    const b = current[table];
    check(!!a && !!b && a.rows === b.rows && a.md5 === b.md5, `${table} matches snapshot`,
      a && b ? `${b.rows} rows` : "missing");
  }
}

async function checkReadonlyRole(): Promise<void> {
  console.log("\nRead-only role");
  const ro = await connect(process.env.READONLY_DATABASE_URL, "READONLY_DATABASE_URL");
  try {
    const { rows } = await ro.query("select count(*)::int as n from partners");
    check(rows[0].n > 0, "can SELECT demo tables", `${rows[0].n} partners`);

    await expectError(ro, "insert into partners (id) values ('X0001')", "INSERT is rejected", ["25006", "42501"]);
    // default_transaction_read_only can be switched off by the session itself,
    // so the real wall is privileges. Prove it holds with read-only turned off.
    await ro.query("set default_transaction_read_only = off");
    await expectError(ro, "insert into partners (id) values ('X0001')", "INSERT is rejected even with read-only off", ["42501"]);
    await expectError(ro, "update partners set tier = 'Elite'", "UPDATE is rejected", ["42501"]);
    await expectError(ro, "delete from opportunities", "DELETE is rejected", ["42501"]);
    await expectError(ro, "create table ecosystem.scratch (x int)", "CREATE TABLE in ecosystem is rejected", ["42501"]);
    await expectError(ro, "create table public.scratch (x int)", "CREATE TABLE in public is rejected", ["42501"]);
    await expectError(ro, "select * from eval._eval_tags", "evaluation labels are hidden", ["42501"]);
    await expectError(ro, "select * from agent_runs", "agent_runs is hidden", ["42501"]);
    await ro.query("reset default_transaction_read_only");
    await expectError(ro, "select pg_sleep(6)", "5-second statement timeout fires", ["57014"]);

    const capped = await runReadOnlyQuery("select * from engagement_events", ro);
    check(capped.rows.length === ROW_CAP && capped.truncated, `helper caps results at ${ROW_CAP} rows`, `${capped.rows.length} returned`);
    // A classic injection: close the subquery, then stack a DELETE.
    await expectHelperError(ro, "select 1 as a) x; delete from partners; select (1", "helper rejects stacked statements");
    await expectHelperError(ro, "delete from partners returning *", "helper rejects non-SELECT statements");
  } finally {
    await ro.end();
  }
}

async function checkDictionary(admin: pg.Client): Promise<void> {
  console.log("\nData dictionary");
  const doc = readFileSync(DICTIONARY, "utf8");
  // Sections start with a heading like: ### `partners`
  const sections = new Map<string, string>();
  for (const part of doc.split(/^### /m).slice(1)) {
    const name = part.match(/^`([^`]+)`/)?.[1];
    if (name) sections.set(name, part);
  }
  // The eval schema holds test cases for grading the AI builds; the dictionary
  // is the AI's own context, so it documents only the ecosystem schema.
  const { rows } = await admin.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'ecosystem' order by table_name, ordinal_position`,
  );
  const missing = rows.filter((r) => !sections.get(r.table_name)?.includes(`| \`${r.column_name}\``));
  check(missing.length === 0, `every column is documented`,
    missing.length ? missing.map((m) => `${m.table_name}.${m.column_name}`).join(", ") : `${rows.length} columns`);
}

async function main(): Promise<void> {
  const admin = await connect(process.env.DATABASE_URL, "DATABASE_URL");
  try {
    await checkDeterminism(admin);
    await checkReadonlyRole();
    await checkDictionary(admin);
  } finally {
    await admin.end();
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
