# Salesforce setup

How Cloud Cruz's Ecosystem Partner Program runs in Salesforce, as code. Every object, field and rule cites the decision it enforces (`../../DECISIONS.md`). The org is a free Developer Edition; all data in it is synthetic.

## What's here

- **Standard objects:** Account (Partner and Customer record types), Contact, Opportunity, Lead (Stage 0 partner leads).
- **Six custom objects:** Deal Registration, Opportunity Partner (one row per partner per deal, with a role), Commission Accrual, Implementation Package, Credential, Partner Touch.
- **Validation rules** that turn program decisions into things the system enforces, for example: nothing is released before the 60-day hold; only a Sourced or Partner of record partner earns commission; an implementation package needs an active Level 2 technical credential on an Enterprise deal.
- **List views:** Who to call today, Accruals held, Deal registrations overdue, Partners with a red.
- **The Cloud Cruz Partner Ops app and permission set.**

## Commands

```
sf project deploy start --target-org cloud-cruz            # deploy
sf org assign permset --name Cloud_Cruz_Partner_Ops --target-org cloud-cruz
sf apex run --target-org cloud-cruz --file scripts/smoke-test.apex   # 24 checks, rolled back
```

## The sample

The 25 beta design partners plus 25 launch partners across the four segments (decision 62), with their customers, deals, partner roles, registrations, people, credentials, accruals, packages and recent touches, plus the 40 open leads at the top of "Who to call today". About 2,000 records, built from the same seeded generator as the database, so it needs no database connection. Each partner's slice is capped to fit Developer Edition's 5 MB of data storage.

```
node blueprint/salesforce/scripts/export-sample.ts                          # writes data/ (run from the repo root)
sf data import tree --plan blueprint/salesforce/data/plan.json --target-org cloud-cruz
sf apex run --target-org cloud-cruz --file blueprint/salesforce/scripts/delete-sample.apex   # to reload
```

Rows that break a program rule, such as a commission released before its hold, cannot be entered: the validation rules reject them, and the exporter counts them.

The walkthrough is `../08-salesforce-setup.md`.
