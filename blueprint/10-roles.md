# 10 Roles

**Nine people run the program all year. Every stage has one accountable owner, every partner has one named person accountable for it, and every AI agent drafts while a person approves. Human time goes to the 80 managed partners and to the exceptions in the long tail.** (Decisions 34, 36, 40, 50, 66, 79, 99, 101)

> All of this is synthetic. Cloud Cruz, its team and its partners are invented.

## The team

Nine people on the partner team, flat all year (decision 66). AEs, solutions architects and lifecycle marketing sit outside it, in sales and marketing.

| Role | Owns | Capacity | Measured by |
|---|---|---|---|
| **Head of partner ecosystem** | Optimize, the long tail, program reviews, the launch checks and guard metrics | n/a | Customers live through partners |
| **Partner development rep (PDR)** | Develop and Acquire, from first touch to signed terms | Top 8 leads a day by fit and intent (decision 70) | Qualified meetings held; fit score of accepted partners |
| **Partner managers (2)** | Onboarding; Acquire support (the meeting, admissions at fit 50 to 69, the Anchor plan); the long tail by exception | About 460 long-tail partners each, worked only when health turns cold or hot (decision 101) | Days to onboarded |
| **Partner account manager** | The 80 managed partners from Activate through Maintain, and co-sell with the AEs | 80 managed partners at most (decisions 66, 101) | Share activated within 90 days; co-sold win rate |
| **Partner solutions architect** | Technical kickoffs, sandbox office hours, implementation-package delivery, Level 2 and 3 proof-of-work reviews | 12 open package deals; 4 ISV integration reviews a month (decision 99) | Package deals live on time |
| **Enablement lead** | Courses, accreditations, Level exams, the weekly cohort session, Support Hub content | n/a | Active certified people |
| **Partner operations** | Salesforce and introw, the commission ledger, deal registration checks, the scorecard, and why long-tail partners stall | n/a | Deal registrations answered in 2 business days |
| **Partner marketing** | The partner directory, co-marketing fund, contribution points, the Slack community, acquisition channels with the PDR | n/a | Partners with approved contributions |

Outside the team:

- **AE:** owns the customer relationship and gets full quota credit on partner deals in their territory (decision 50).
- **Solutions architect (sales):** the customer's technical lead on co-sold deals.
- **Lifecycle marketing:** runs the automated onboarding and re-engagement campaigns that partner operations designs fixes for (decision 101).

## Two books, one name on every partner

| Book | Partners | Accountable | Who acts | How |
|---|---|---|---|---|
| **Managed** | 80: all Anchor and Scale partners, plus Specialists assigned a partner account manager | Partner account manager | Partner account manager, with the partner solutions architect | Touch cadence by segment (decision 55) |
| **Long tail** | About 920 Builder and Specialist partners | Head of partner ecosystem | Partner managers, by exception | Automation does the routine work. A person acts when health turns cold or hot (decision 46). Partner operations fixes repeated stalls for everyone (decision 101) |

**Why it works.** A stall seen once is a partner manager's call. A stall seen twice is a pattern, so partner operations finds the cause and fixes it with partner marketing and lifecycle marketing: a clearer onboarding step, a better nudge, a new campaign. The long tail gets better without more people.

## RACI across the eight stages

Each stage has exactly one accountable owner. **Accountable** answers for the result; **Does the work** is everyone who carries it out (the owner included, where they do); **Consulted** gives input before; **Informed** hears after.

| Stage | Accountable | Does the work | Consulted | Informed |
|---|---|---|---|---|
| **0 Develop** | PDR | PDR | Partner marketing | Head of partner ecosystem, Partner managers |
| **1 Acquire** | PDR | PDR, Partner managers | Head of partner ecosystem | Partner account manager, Partner operations |
| **2 Onboard** | Partner managers | Partner managers, Partner solutions architect, Enablement lead, Partner operations | Partner account manager, Lifecycle marketing | AE |
| **3 Activate, managed** | Partner account manager | Partner account manager, Partner solutions architect | AE | Head of partner ecosystem |
| **3 Activate, long tail** | Head of partner ecosystem | Partner managers, Partner operations | Partner marketing, Lifecycle marketing | None |
| **4 Enable** | Enablement lead | Partner solutions architect, Enablement lead | None | Partner account manager |
| **5 Hand off / Co-sell** | Partner account manager | Partner account manager, Partner solutions architect, Partner operations, AE | None | None |
| **6 Maintain, managed** | Partner account manager | Partner account manager, Partner marketing | Partner solutions architect | Head of partner ecosystem |
| **6 Maintain, long tail** | Head of partner ecosystem | Partner managers, Partner operations | Partner marketing, Lifecycle marketing | None |
| **7 Optimize** | Head of partner ecosystem | Head of partner ecosystem, Partner operations | PDR, Partner managers, Partner account manager, Partner solutions architect, Enablement lead, Partner marketing | None |

What "does the work" means in the less obvious cells:

- **Acquire, partner managers:** they hold the meeting, decide admissions at fit 50 to 69 with a logged reason, and build the Anchor plan. The PDR stays the owner through signing, so the partner never starts over (decision 79).
- **Onboard, partner operations:** Tipalti KYC, Salesforce and introw provisioning, the sandbox account. **The partner solutions architect** runs the technical kickoff for managed partners and sandbox office hours for everyone (decisions 40, 46).
- **Hand off / Co-sell, partner operations:** checks each deal registration for conflicts in Salesforce and Crossbeam so the partner account manager can answer within 2 business days (decision 79). **The AE** owns the customer and the deal (decision 50).

## Approvals: a person signs off on every change of state

| What changes | Prepared by | Approved by | Decision |
|---|---|---|---|
| An AI outreach send | The agentic PDR drafts it | PDR | 63, 71 |
| A tier change | Partner operations computes it monthly | Head of partner ecosystem | 71, 92 |
| An implementation package | Partner account manager requests; the partner solutions architect confirms a Level 2 person | Head of partner ecosystem, against the budget | 53, 96 |
| A commission release | Partner operations reconciles the ledger after the 60-day hold | Finance, in Tipalti | 21, 24 |
| A co-marketing campaign | The partner applies in introw | Partner marketing | 77 |
| A contribution point | The partner submits in introw | Partner marketing | 78 |
| An admission at fit 50 to 69 | PDR | Partner manager, with a logged reason | 37 |
| A deal registration | Partner operations checks for conflicts | Partner account manager | 79 |

## Where the AI agents work

Agents carry the routine work so 9 people can serve about 1,000 partners. Each one has a human owner, and none changes state on its own.

| Agent (build) | What it does | Human owner |
|---|---|---|
| Agentic PDR (build 3) | Scores partner leads on fit and intent, drafts outreach | PDR approves every send |
| Propensity and tier agent (build 3) | Flags partners likely to activate or move tier | Head of partner ecosystem approves tier changes |
| Answer Engine (build 4) | Answers partner questions from the Support Hub, with citations | Enablement owns the content; partner operations owns answer quality |
| Deal registration triage (build 4) | Checks conflicts and recommends an answer | Partner account manager decides |

## Who administers each tool

Partner operations owns the Salesforce and introw configuration (07 Systems). Every other tool has one named admin.

| Tool | Admin |
|---|---|
| Salesforce, introw | Partner operations |
| Tipalti | Partner operations, with finance |
| Pearson VUE, Credly | Enablement lead |
| Crossbeam | Partner operations |
| Slack community and Slack Connect | Partner marketing |
| Zendesk | Partner operations |
| Support Hub | Enablement lead (content), partner operations (Answer Engine quality) |
| Partner directory | Partner marketing |
| Typed-decision layer | Partner operations; the head of partner ecosystem approves the weights |

## Why this saves time and money

One accountable person per stage and per partner means nothing waits on a meeting about who acts. Capacity caps say out loud where a person's time runs out, and what happens next: partners with Level 2 people lead their own deals, and automation carries the long tail. Fixing a stall once for everyone costs less than chasing it partner by partner, so the team stays at 9 while the program grows to about 1,000 partners.
