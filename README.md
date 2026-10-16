# Cloud Cruz Ecosystem

**A partner program designed from zero, and the systems that run it.**

Cloud Cruz is a fictional AI data platform with customers and no partner program. I'm Tony Gilharry, and in this repo I lead its partner ecosystem: I designed the Ecosystem Partner Program from nothing (who to recruit, how partners earn, the eight stages every partner goes through) and built the data, the Salesforce setup and the AI workflows that run it.

The north star is customers live through partners. The target for Year 1 was 400; the modeled Year 1 reaches 445, with about 1,000 signed partners and a partner team that stays at 9.

> **All data is synthetic.** Cloud Cruz, its partners, customers, people and every number are invented, on a fictional calendar (Jan 2027 to Mar 2028). Nothing comes from, or resembles, any real company's program.

## Start here (5 minutes)

1. **[The scenario](blueprint/01-scenario.md):** what Cloud Cruz sells, to whom, and why partners.
2. **[The economics](blueprint/04-economics.md):** tiers, commissions, and the implementation package partners sell with.
3. **[The Salesforce setup](blueprint/08-salesforce-setup.md):** the rules the system enforces, with screenshots from the org.
4. **[The decision log](DECISIONS.md):** every call, with the options considered and why. Five to read first:
   - **57:** the north star is customers live through partners, not partners signed.
   - **94:** influence is rewarded with work, not cash.
   - **95:** launch holds its date, with a go/no-go check on four must-haves.
   - **101:** two books, managed and long tail, on a flat team.
   - **105:** two revenue measures, never double counted.

![Who to call today: the partner leads list in Salesforce, ranked by fit and intent](blueprint/salesforce/screenshots/04-who-to-call-today.jpg)

## How it was built

I make every decision. Claude (Anthropic's AI) researches the market, lays out the options with their trade-offs, and builds what I decide. Each call is logged in [DECISIONS.md](DECISIONS.md) with its date, the options on the table and the reason, so the log and the commit history together show who decided what.

## Builds

Each build answers one question a partner team asks. Shipped builds show the month they shipped; the rest show a status, never a date.

| # | Build | The question it answers | Status |
|---|---|---|---|
| 0 | [Foundation](foundation/) | What does the program's data look like, and what can AI safely query? | Shipped Sep 2026 |
| 1 | [Program Blueprint](blueprint/) | How do you design a partner program from zero, stage by stage? | Shipped Oct 2026 |
| 2 | Measurement Layer | What did partners source and influence, and what did it cost? | Building now: the [metric views](foundation/db/migrations/003_metrics.sql) are in |
| 3 | Propensity and tier agent | Which partners deserve investment, and which tiers are wrong? | Planned |
| 4 | Answer Engine and deal registration triage | What do the rules say, and which registrations need a person? | Planned |
| 5 | Year-1 review | What worked in Year 1, where did it break, and what changes in Year 2? | Planned |

## How the pieces fit

Every build runs on the same [Foundation](foundation/): one synthetic partner program in Postgres, generated from a fixed seed so every run is reproducible. The rules that decide partner credit live in plain YAML ([`attribution.yaml`](foundation/config/attribution.yaml), [`program.yaml`](foundation/config/program.yaml)), and every table, view and metric is defined in the [data dictionary](foundation/docs/data-dictionary.md). The AI in later builds reads that same dictionary, so people and the model work from one definition. Terms are defined in the [glossary](blueprint/glossary.md).

AI-written SQL runs as a read-only database role with a 5-second limit and a 500-row cap. Anything an AI proposes that would change data waits for a person to approve it.

## Run it

You need Node 24 and a Postgres database with the `vector` extension (pgvector). A Supabase project works; a local Postgres works too, and skips TLS.

```bash
npm ci
cp .env.example .env.local   # fill in both database URLs (see below)
npm run db:reset             # build the schema and load the synthetic data
npm run db:verify            # check determinism, guardrails and the dictionary
```

- Set `READONLY_DATABASE_URL` before the first `db:reset`: the reset creates the read-only role and sets its password from that URL.
- On Supabase, download the CA certificate (Database settings, SSL) and point `DATABASE_CA_CERT` at it, so TLS verifies the server.
- `npm run db:preview` generates everything in memory and prints a summary without touching a database.

## License

Code is under the [MIT License](LICENSE). The program design, documents, decision log and screenshots are under [CC BY 4.0](LICENSE-docs): reuse them with credit to Tony Gilharry.
