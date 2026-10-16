// One entry point for the database:
//   reset    drop the ecosystem schemas, apply migrations, seed   (npm run db:reset)
//   seed     regenerate data into the existing schema             (npm run db:seed)
//   preview  generate in memory and print the summary, no database (npm run db:preview)
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { generateDataset, summarize, writeDataset } from "../seed/index.ts";
import { connect } from "./client.ts";

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

async function reset(client: pg.Client): Promise<void> {
  // Only our two schemas are dropped. Nothing else in the database is touched.
  await client.query("drop schema if exists ecosystem cascade; drop schema if exists eval cascade;");
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(MIGRATIONS_DIR + file, "utf8"));
    console.log(`applied ${file}`);
  }
  await setReadonlyPassword(client);
}

/** The read-only password lives only in READONLY_DATABASE_URL, never in git. */
async function setReadonlyPassword(client: pg.Client): Promise<void> {
  const url = process.env.READONLY_DATABASE_URL;
  if (!url) {
    console.warn("READONLY_DATABASE_URL not set; the read-only role has no password and cannot log in yet.");
    return;
  }
  const password = decodeURIComponent(new URL(url).password);
  await client.query(`alter role ecosystem_readonly with password ${client.escapeLiteral(password)}`);
  console.log("set ecosystem_readonly password from READONLY_DATABASE_URL");
}

async function seed(client: pg.Client): Promise<void> {
  const started = Date.now();
  const generated = generateDataset();
  await writeDataset(client, generated.data);
  console.log(summarize(generated));
  console.log(`\nseeded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "preview") {
    console.log(summarize(generateDataset()));
    return;
  }
  if (command !== "reset" && command !== "seed") {
    throw new Error("usage: node foundation/db/run.ts <reset|seed|preview>");
  }
  const client = await connect(process.env.DATABASE_URL, "DATABASE_URL");
  try {
    if (command === "reset") await reset(client);
    await seed(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
