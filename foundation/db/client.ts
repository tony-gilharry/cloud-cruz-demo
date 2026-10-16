import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * Opens a Postgres connection with TLS verified. Supabase signs its database
 * certificates with its own CA, so point DATABASE_CA_CERT at the CA file
 * from the Supabase dashboard (Database settings > SSL). Localhost skips TLS.
 */
export async function connect(url: string | undefined, label: string): Promise<pg.Client> {
  if (!url) throw new Error(`${label} is not set. Copy .env.example to .env.local and fill it in.`);
  const { hostname } = new URL(url);
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const ca = process.env.DATABASE_CA_CERT;
  const client = new pg.Client({
    connectionString: url,
    ssl: local ? false : { ca: ca ? readFileSync(ca, "utf8") : undefined, rejectUnauthorized: true },
  });
  try {
    await client.connect();
  } catch (error) {
    if (!local && !ca && String(error).includes("certificate")) {
      throw new Error("TLS verification failed. Set DATABASE_CA_CERT to the Supabase CA file (see foundation/README.md).", { cause: error });
    }
    throw error;
  }
  return client;
}

// Postgres caps a statement at 65,535 bind parameters. Stay well under it.
const MAX_PARAMS = 60_000;

/** Multi-row INSERT in batches. Rows are arrays in column order. */
export async function insertRows(client: pg.Client, table: string, columns: string[], rows: unknown[][]): Promise<void> {
  const batchSize = Math.min(1000, Math.floor(MAX_PARAMS / columns.length));
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const slots = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${slots.join(", ")})`;
    });
    await client.query(`insert into ${table} (${columns.join(", ")}) values ${tuples.join(", ")}`, values);
  }
}
