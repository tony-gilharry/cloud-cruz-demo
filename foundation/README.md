# Foundation

**Build 0 · shipped Sep 2026**

The data, rules and guardrails every other build runs on. One reproducible synthetic partner program for Cloud Cruz, a fictional vendor.

> **All data here is synthetic.** Cloud Cruz, its partners, customers, people and every number are invented.

## The synthetic program

Year 1 of the program I designed for Cloud Cruz, on a fictional calendar: the 90-day beta from Jan 1, 2027, launch on Apr 1, 2027, and Year 1 ending Mar 31, 2028. Every rule traces to a decision in [`DECISIONS.md`](../DECISIONS.md), and the data behaves like a real first year, messy parts included:

- **The funnel:** about 5,300 partner leads (about 70 a week), scored on fit and intent, turning into **about 1,000 signed partners**: 25 beta design partners, then a launch ramp. Four segments (Anchor, Scale, Specialist, Builder) across five partner types.
- **Onboarding, watched daily:** one health row per partner per day until onboarded, with the early-warning rules and the interventions they triggered.
- **The north star:** about 264 partners activated and about 445 customers live through partners, with the 90-day cohort activation rate climbing toward 40% as the year goes on.
- **Deals and money:** about 3,700 opportunities with a partner-role roster (sourced, influenced, implementer, partner of record), quarterly and monthly invoices, a commission ledger that holds 60 days and claws back refunds, SPIFFs, implementation packages, co-marketing campaigns and monthly program costs on a flat team of 9.
- **Enablement and community:** the five-step credential ladder, proctored exams and vouchers, contribution points, support questions (most answered by the Support Hub), and an engagement trail that never counts as activity.
- **Tiers that follow counts:** checked monthly against certified people, live customers, references, sourced revenue and points.
- **Realistic problems**, the kind a real program has: duplicate and conflicting deal registrations, partners who quietly stopped selling, tier labels that don't match the counts, onboarding stalls nobody acted on, and deals with two partners on them. The later builds are graded on finding them.

The rules that decide credit live in [`config/attribution.yaml`](config/attribution.yaml); tiers, rates, holds, packages, exams, onboarding and routing live in [`config/program.yaml`](config/program.yaml). Change a rule, rebuild, and every number follows. Every table, column and metric is defined in the [data dictionary](docs/data-dictionary.md).

`npm run db:reset` (from the repo root) drops and rebuilds only the `ecosystem` and `eval` schemas, so it is safe to run again and again. It always produces the same data, row for row, because the generator uses a fixed seed and a fixed "today" of March 31, 2028 (`as_of` in `program.yaml`). `npm run db:preview` prints the Year-1 targets without touching the database.

## Guardrails

Later builds let an AI write SQL. That only works if the database itself refuses to let that SQL do harm, whatever the prompt says.

- **A read-only database role.** AI-generated SQL runs as `ecosystem_readonly`. It can read the demo tables and nothing else: no inserts, updates, deletes or schema changes, and no access to the evaluation labels or the agent logs. The database enforces this, not the app.
- **A 5-second limit** on every statement, set on the role.
- **A 500-row cap.** Postgres has no per-role row limit, so [`db/readonly.ts`](db/readonly.ts) wraps every query as a capped subquery inside a read-only transaction. That also turns anything that is not a SELECT into an error and blocks stacked statements.
- **No secrets in the repo.** Connection strings and keys live in `.env.local`. [`.env.example`](../.env.example) lists every variable with no real values. The read-only role's password is set by `db:reset` from `READONLY_DATABASE_URL`, so it never appears in a SQL file.
- **Humans approve changes.** Any AI output that would change data waits in `agent_runs` for a person to approve it.

`npm run db:verify` proves the role holds: it connects as `ecosystem_readonly`, tries to insert, update, delete, create tables, read the evaluation labels and run a 6-second query, and passes only if every attempt fails.

### Environment variables

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Admin connection. Used only by the reset and seed scripts. |
| `READONLY_DATABASE_URL` | The `ecosystem_readonly` connection that AI-generated SQL uses. |
| `DATABASE_CA_CERT` | Path to the Supabase CA certificate so TLS verifies the server. |

Build 2's "Ask the data" runs on the portfolio site and calls Claude through Vercel AI Gateway, so this repo needs no AI key; its daily spend cap is an AI Gateway budget (decision 104).


## What's here

```
config/        attribution and program rules (YAML)
db/            migrations (001 schema, 002 read-only role, 003 metric views for
               Build 2, granted to the read-only role), the reset/seed runner,
               the read-only query helper
seed/          the synthetic data generator and its seeded scenarios
docs/          the data dictionary
verify.ts      the "done" checks
```
