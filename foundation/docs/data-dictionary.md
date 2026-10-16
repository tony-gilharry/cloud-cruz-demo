# Data dictionary: Ecosystem Partner Program

This file describes every table, every column and every metric in the Ecosystem database. It is written for two readers: a person exploring the data, and the AI that writes SQL in the Measurement Layer, which receives this file as its schema context.

All data is synthetic. Cloud Cruz, its partners, customers, people and every number are invented. Decision numbers in brackets point to [`DECISIONS.md`](../../DECISIONS.md).

## Ground rules

- **Schema.** All demo tables live in the `ecosystem` schema. The read-only role's search path is already set, so `select * from partners` works.
- **Today is 2028-03-31.** The dataset is frozen as of `2028-03-31 23:59:59 UTC`. Use `timestamp '2028-03-31 23:59:59+00'` (or `date '2028-03-31'`) wherever you would use `now()`. Using `now()` gives wrong answers.
- **The window.** The data runs from the 90-day beta (`2027-01-01` to `2027-03-31`) through Year 1 (`2027-04-01` to `2028-03-31`) [87, 102]. Leads start in Nov 2026.
- **Money** is in US dollars, `numeric`. `opportunities.amount` is annual contract value (ACV).
- **Times** are `timestamptz` in UTC unless the column is a `date`.
- **Ids** are readable text with a table prefix, assigned in time order: `U01` (team member), `L00001` (lead), `P0001` (partner), `PP00001` (partner person), `A0001` (account), `O000001` (opportunity), `DR00001` (deal registration), `T000001` (deal touch), `INV000001` (invoice), `CR00001` (credential), `EX00001` (exam attempt), `H00001` (tier history), `CA00001` (commission accrual), `IP0001` (implementation package), `CM0001` (co-marketing campaign), `CO00001` (contribution), `ST00001` (support ticket), `E000001` (engagement event), `DOC01` (program doc).
- **Rules live in config.** Windows, rates and thresholds come from [`config/attribution.yaml`](../config/attribution.yaml) and [`config/program.yaml`](../config/program.yaml). The values below are the current ones.
- **Limits.** Generated SQL runs as `ecosystem_readonly`: SELECT only, 5-second timeout, 500 rows maximum. Aggregate in SQL rather than pulling raw rows.

## Approximate size

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| team_members | 9 | | credentials | 6,200 |
| partner_leads | 5,300 | | exam_attempts | 2,400 |
| partners | 1,000 | | tier_history | 1,000 |
| partner_people | 6,400 | | commission_accruals | 1,400 |
| onboarding_signals | 18,000 | | implementation_packages | 58 |
| accounts | 3,000 | | co_marketing_campaigns | 3 |
| opportunities | 3,700 | | program_costs | 90 |
| opportunity_partners | 2,100 | | contributions | 1,100 |
| deal_registrations | 1,600 | | support_tickets | 3,300 |
| deal_touches | 1,800 | | engagement_events | 53,000 |
| invoices | 4,100 | | program_docs | 14 |

Run `npm run db:preview` for exact counts and the Year-1 targets.

## Tables

### `team_members`

The partner team: 9 people all year [66]. AEs sit in sales and appear only as `accounts.owner`.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `U01` to `U09`. |
| `name` | text | Invented name. |
| `role` | team_role | `head_of_partner_ops`, `pdr` (partner development rep), `partner_manager` (two), `partner_account_manager`, `partner_solutions_architect`, `enablement`, `partner_operations`, `partner_marketing`. |

### `partner_leads`

Stage 0, Develop: every firm the PDR worked, inbound or outbound, converted or not [34 to 36, 68 to 70]. Converted leads link from `partners.lead_id`.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `L00001`. |
| `company` | text | Invented firm name, unique. For converted leads it equals `partners.name`. |
| `type` | partner_type | `agency`, `SI`, `ISV`, `tech`, `reseller`. |
| `segment` | partner_segment | `anchor`, `scale`, `specialist`, `builder` [28]. |
| `region` | region | `us`, `canada`, `latam`, `uk_ireland`, `anz` [67]. |
| `motion` | lead_motion | `inbound` (the firm came to us) or `outbound` (the PDR reached out). |
| `owner_id` | text | The PDR who owns the lead. References `team_members.id`. |
| `created_at` | timestamptz | When the lead was created. |
| `fit_score` | smallint | 0 to 100 IPP fit score [29]. 70+ is approved automatically, 50 to 69 goes to a partner manager, under 50 goes to nurture [37]. |
| `intent_application` | smallint | 30 if the firm completed the program application, else 0 [68]. |
| `intent_meeting` | smallint | 20 if it replied to outreach or booked a meeting, else 0. |
| `intent_timeline` | smallint | Stated need and timeline: 20 (now), 10 (this quarter), 0 (later or unknown). |
| `intent_events` | smallint | Webinar or cohort attendance, 10 each, up to 20. |
| `intent_content` | smallint | Directory visits or content downloads, 0 to 10. |
| `intent_score` | smallint | Sum of the five components, before the 30-day half-life. To score "now", halve the components for signals older than 30 days relative to `last_signal_at`. |
| `last_signal_at` | timestamptz | The most recent intent signal. |
| `deal_in_hand` | boolean | The firm arrived with a named customer deal. Always `temperature = 'urgent'` [35]. |
| `temperature` | lead_temperature | Fit x intent routing: `urgent` (deal in hand), `hot` (fit 70+ and intent 50+), `warm` (one of the two), `nurture` (neither). |
| `route` | lead_route | Where the lead went: `person` (hot and urgent, worked by a person), `nurture` (the automated sequence), `agent_draft` (the PDR agent drafts outreach; arrives with build 3, so unused in Year 1) [70]. |
| `stated_timeline` | stated_timeline | The typed judgment read from the application or reply: `now`, `this_quarter`, `later`. Null if the firm never replied [69]. |
| `judgment_confidence` | numeric | Model confidence, 0 to 1. Null in Year 1: the typed-decision layer runs by hand until build 3 [69]. |
| `judgment_model` | text | Who made the judgment: `manual` in Year 1. Build 3 records the model name. |
| `judged_at` | timestamptz | When the judgment was made. Null exactly when `stated_timeline` is null. |
| `human_review` | boolean | A low-confidence judgment sent to a person. Always false in Year 1 (no model yet). |
| `audited` | boolean | In the random 5% weekly audit [70]. |
| `meeting_at` | timestamptz | Meeting with a director-level or more senior decision maker, if one happened. |
| `handoff_at` | timestamptz | Warm handoff to a partner manager, within one business day of the meeting [36]. |
| `outcome` | lead_outcome | `converted` (became a partner), `nurture`, `disqualified` (failed a gate), `open` (still being worked; created in the last 30 days). |

### `partners`

One row per partner that signed. About 1,000 signed by Mar 31, 2028, including 25 beta design partners [15, 65].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `P0001` to about `P0997`, in signing order. |
| `name` | text | Invented company name, unique. |
| `lead_id` | text | The lead it came from. References `partner_leads.id`. |
| `type` | partner_type | `agency`, `SI`, `ISV`, `tech`, `reseller`. ISVs and tech partners join from `2027-10-01` (except 4 beta ISVs); resellers from `2027-10-01` [15]. |
| `segment` | partner_segment | `anchor` (invited, about 12), `scale`, `specialist`, `builder` (most) [28]. |
| `path` | partner_path | `services` (agency, SI, reseller) or `technology` (ISV, tech). |
| `region` | region | `us`, `canada`, `latam`, `uk_ireland`, `anz`. |
| `beta` | boolean | One of the 25 design partners who signed in January 2027. |
| `fit_score` | smallint | Fit score at application, 0 to 100. |
| `fit_outcome` | fit_outcome | `auto_approved` (fit 70+) or `human_review` (50 to 69, admitted by a partner manager) [37]. |
| `review_reason` | text | The logged reason for a `human_review` admission. Null otherwise. |
| `applied_at` | date | Application date. |
| `accepted_at` | date | Accepted into the program. |
| `agreement_path` | agreement_path | `click_through` on first portal login, or `procurement` (a $0 invoice through the partner's procurement) [39]. |
| `terms_accepted_at` | date | **Signing date.** Use this as the partner's start date and for monthly cohorts. |
| `onboarding_plan` | onboarding_plan | `standard_30` or `accelerated` (14 days) for managed partners; `automated` for the long tail [40]. |
| `partner_manager_id` | text | Assigned partner manager. References `team_members.id`. |
| `partner_account_manager_id` | text | Set only for **managed** partners (Anchor, Scale and a few Specialists, 60 to 80 in total). References `team_members.id`. |
| `onboarded_at` | date | All six onboarding items done [40]. Null if not done by Mar 31, 2028. |
| `first_deal_registration_at` | date | Activation milestone 1: first deal registration submitted, any status [43]. |
| `first_closed_won_at` | date | Milestone 2: first won deal where the partner is `sourced`, `partner_of_record` or `implementer`. |
| `first_live_customer_at` | date | Milestone 3: first such deal live in production. **Activated** means this is set. |
| `activation_rating` | health_state | `hot` (live within 60 days of signing), `warm` (within 150 days, or a deal registration in the first 30), `cold` (otherwise) [43]. |
| `tier` | partner_tier | Current tier **label**: `Member`, `Select`, `Premier`, `Elite`. The label usually matches the counts, but not always (see *Tier mismatch*). |
| `elite_invited` | boolean | Invited from the Anchor list to work toward Elite (Jan 1, 2028 review) [32]. |
| `status` | partner_status | `active`, or `alumni` after a year with no customer activity [56]. Not the same as an *active partner* (see metrics). |
| `alumni_at` | date | When the partner moved to the alumni list. Null for active partners. |
| `delivery_maturity` | smallint | 1 (new, limited delivery) to 5 (mature practice). |
| `avg_project_value` | numeric | The partner's typical project size in dollars, self-reported. |

### `partner_people`

Named people at each partner: the three onboarding contacts plus everyone who earns a credential.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `PP00001`. |
| `partner_id` | text | References `partners.id`. |
| `name` | text | Invented name. Names can repeat across partners. |
| `role` | person_role | `executive_sponsor`, `technical_lead`, `sales_lead` (the three named contacts), or `technical`, `business`. |
| `added_at` | date | When the person was added. |

### `onboarding_signals`

Stage 2: one row per partner per day from signing until onboarded, or until 14 days past its segment ceiling. The daily health check that catches stalls in days, not at day 45 [41, 44, 46].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `partner_id` | text | References `partners.id`. Primary key with `day`. |
| `day` | date | The calendar day. |
| `day_number` | smallint | Day 1 is the signing day. |
| `logged_in` | boolean | The partner's first portal login has happened. |
| `checklist_pct` | smallint | Share of the onboarding checklist done, 0 to 100. |
| `plan_pct` | smallint | Where the partner's own plan says it should be, 0 to 100. Plan length: 14 days (accelerated), 30 (standard), or the segment ceiling for automated plans (Builder 14, Specialist 30, Scale and Anchor 45). |
| `accreditations` | smallint | Sales and Technical Accreditations earned so far, 0 to 2. |
| `sandbox_builds` | smallint | Builds in the partner sandbox so far. |
| `cohort_sessions` | smallint | Weekly live cohort sessions attended so far. |
| `slack_active` | boolean | Posted in Slack that day. A fair leading indicator; never counts as activity. |
| `crossbeam_overlaps` | smallint | Shared target accounts found in Crossbeam. |
| `deal_registered` | boolean | A deal registration has been submitted. |
| `health` | health_state | `cold` when 40% or more behind plan or not logged in by day 3; `hot` when a deal is registered or 10 points ahead of plan; else `warm`. "Behind" is `1 - checklist_pct / plan_pct`. |
| `intervention` | intervention | Set on the day a rule fires, else `none`: `outreach` (no login by day 3), `nudge` (automated, 25% behind), `person` (went cold), `office_hours` (no sandbox build by day 10), `fast_track` (deal registered: fast track to co-sell). *Human touch* means `outreach`, `person` or `office_hours`. |

### `accounts`

Customer and prospect companies. Mid-market software companies are the primary ICP [14].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `A0001` to `A3000`. |
| `name` | text | Invented company name, unique. |
| `segment` | account_segment | `smb` (under 200 employees), `midmarket` (200 to 2,000), `enterprise` (over 2,000). |
| `region` | region | `us`, `canada`, `latam`, `uk_ireland`, `anz`. |
| `employees` | integer | Headcount. |
| `owner` | text | The AE who owns the customer relationship [50]. |

### `opportunities`

Every deal, direct and partner. The opportunity always lives on the **customer** account, owned by the AE; partners attach through `opportunity_partners` [85].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `O000001`, in creation order. |
| `account_id` | text | The customer. References `accounts.id`. |
| `pricing_plan` | pricing_plan | `self_serve` (monthly, under $12K ACV), `premium` ($12K to $50K), `enterprise` ($50K+) [60]. |
| `amount` | numeric | Annual contract value in dollars. |
| `term_months` | smallint | 1 for self-serve; 12 for Premium; 12, 24 or 36 for Enterprise. |
| `stage` | opportunity_stage | `prospecting`, `qualification`, `proposal`, `negotiation`, `closed_won`, `closed_lost`. |
| `created_at` | timestamptz | When the opportunity was created. A few direct deals were created before the window. |
| `closed_at` | timestamptz | Null while open. |
| `won` | boolean | Null while open. |
| `go_live_at` | date | The customer went live in production. Set only on won deals, and only when it happened by Mar 31, 2028. |
| `source` | opportunity_source | `partner_sourced`, `direct`, `marketplace` (from `2027-10-01`). |
| `sourcing_partner_id` | text | The partner that sourced the deal and is paid commission. Set exactly when `source = 'partner_sourced'`. |
| `marketplace` | cloud_marketplace | `aws`, `gcp`, `azure` on marketplace deals; null otherwise. The partner of record is in `opportunity_partners`. |
| `competitive_migration` | boolean | A migration off a named competitor platform [45]. |
| `public_reference` | boolean | The live customer agreed to be a public reference for the partner(s) on the deal [33]. |

### `opportunity_partners`

One row per partner per deal, with its role [85]. A deal can have one partner that sourced it and another that implemented it.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `opportunity_id` | text | References `opportunities.id`. |
| `partner_id` | text | References `partners.id`. |
| `role` | partner_role | `sourced` (brought the deal; paid commission), `partner_of_record` (marketplace; paid 5%), `implementer` (delivered it), `influenced` (co-sold or influenced; counts toward tier, no commission) [74, 94]. |
| `added_at` | timestamptz | When the partner joined the deal. |

### `deal_registrations`

Partner claims on customer deals [35, 79].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `DR00001`. |
| `partner_id` | text | The registering partner. References `partners.id`. |
| `account_id` | text | The customer. References `accounts.id`. |
| `opportunity_id` | text | Set once the registration became an opportunity. |
| `submitted_at` | timestamptz | When submitted. |
| `amount` | numeric | The partner's estimate of the deal's ACV. |
| `product` | product | `warehouse`, `pipelines`, `agents`, `governance`. |
| `status` | deal_reg_status | `pending`, `approved`, `rejected`, `expired` (approved, but no opportunity within 90 days). |
| `reason` | text | Why it was rejected or expired: `incomplete_information`, `customer_not_eligible`, `existing_customer_relationship`, `duplicate_registration`, `existing_direct_opportunity`, `protection_window_lapsed`. |
| `sla_due_at` | timestamptz | Two business days after submission [79]. |
| `responded_at` | timestamptz | When Cloud Cruz answered. Null exactly when `pending`. |

### `deal_touches`

Partner activity on a specific deal, the input to attribution.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `T000001`. |
| `opportunity_id` | text | References `opportunities.id`. |
| `partner_id` | text | References `partners.id`. |
| `touch_type` | touch_type | `referral`, `co_sell`, `implementation`, `influence`. |
| `touched_at` | timestamptz | When it happened. |

### `invoices`

Billing for every won deal. Self-serve bills monthly by card; Premium and Enterprise bill quarterly in advance, net 30 [93].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `INV000001`. |
| `opportunity_id` | text | References `opportunities.id`. |
| `account_id` | text | References `accounts.id`. |
| `period_start` | date | First day of the billed period. |
| `amount` | numeric | ACV divided by 12 (monthly) or 4 (quarterly). |
| `issued_at` | date | Invoice date. |
| `paid_at` | date | Null if unpaid on Mar 31, 2028. Commission is earned only on a paid invoice [21]. |
| `refunded_at` | date | Set when the customer refunded; within 90 days of payment this reverses the commission [75]. |

### `credentials`

The five-step ladder, one row per credential per person [27, 47, 80].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `CR00001`. |
| `person_id` | text | References `partner_people.id`. |
| `partner_id` | text | References `partners.id`. |
| `step` | credential_step | `sales_accreditation`, `technical_accreditation` (with onboarding), `level_1`, `level_2`, `level_3`. |
| `track` | credential_track | `technical` or `business` for Levels; null for accreditations. |
| `issuer` | text | `Credly` [22]. |
| `issued_at` | date | When earned. |
| `expires_at` | date | Levels: `issued_at` plus 365 days. Accreditations never expire (null) [80]. A renewal is a new row. |
| `last_product_use_at` | date | The person's latest hands-on product use. A person counts toward tier only with use in the last 90 days [47]. |

### `exam_attempts`

Proctored Level exams through Pearson VUE [81, 83]. A pass issues a `credentials` row.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `EX00001`. |
| `person_id` | text | References `partner_people.id`. |
| `partner_id` | text | References `partners.id`. |
| `step` | credential_step | `level_1`, `level_2` or `level_3`. |
| `track` | credential_track | `technical` or `business`. |
| `attempted_at` | date | Exam date. |
| `fee` | numeric | $100 (Level 1) or $150 (Levels 2 and 3). |
| `passed` | boolean | Pass or fail. |
| `paid_by` | exam_payment | `voucher` (free to the partner) or `partner` (pool used up). |
| `voucher_source` | voucher_source | `tier` (5, 10, 10 or 15 a year by tier, reset Oct 1), `accelerated_plan` (one extra per person), `anchor` (10 extra a year). Null when the partner paid. |

### `tier_history`

Every tier label change [33, 92].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `H00001`. |
| `partner_id` | text | References `partners.id`. |
| `tier` | partner_tier | The new label. |
| `reason` | tier_change_reason | `signed` (Member at signing), `promoted` (met the criteria at a monthly check on the 1st), `label` (set by hand, with no counts behind it). |
| `changed_at` | date | Effective date. The label on a date is the latest row on or before it. |

### `commission_accruals`

The commission ledger [21, 24, 25, 72 to 76, 88]. Earned on a paid invoice, held 60 days, released on the next payout run (the 15th); reversed on a refund within 90 days.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `CA00001`. |
| `partner_id` | text | The partner paid. References `partners.id`. |
| `opportunity_id` | text | The customer deal. References `opportunities.id`. |
| `role` | partner_role | The partner's role on the deal: `sourced` or `partner_of_record` for commissions; any credited role for SPIFFs. |
| `invoice_id` | text | The paid invoice. Null for SPIFFs. |
| `mechanism` | commission_mechanism | `per_invoice` (self-serve), `annualized` (quarterly invoices on annual plans), `spiff`. |
| `spiff_trigger` | spiff_trigger | `first_customer_live` ($500), `first_enterprise_live` ($2,500), `retained_12_months` ($1,000). From Jul 1, 2027. Null for commissions. |
| `rate` | numeric | Commission rate, locked at the tier label held when the deal closed: 0.10, 0.15, 0.20, 0.25; 0.05 for partner of record. Null for SPIFFs. |
| `amount` | numeric | Dollars: `rate` times the invoice amount, or the SPIFF amount. |
| `status` | accrual_status | `held` (inside the 60-day hold), `earned` (hold over, waiting for the payout run), `released` (paid through Tipalti), `reversed` (refund clawback). |
| `earned_at` | date | Invoice paid date, or the SPIFF trigger date. |
| `hold_until` | date | `earned_at` plus 60 days. |
| `released_at` | date | Payout run date. Set exactly when `released`. Must be on or after `hold_until`. |
| `reversed_at` | date | Refund date. Set exactly when `reversed`. |

### `implementation_packages`

Cloud Cruz pays for a partner's first hours on an Enterprise deal it sourced, implemented or helped close [45, 53, 61, 91, 94].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `IP0001`. |
| `opportunity_id` | text | An Enterprise deal of $50K ACV or more. References `opportunities.id`. |
| `partner_id` | text | References `partners.id`. |
| `credential_id` | text | The Level 2 or 3 technical credential that qualifies the deal. Null only on beta packages where the PSA stood in [91]; any other null breaks the rule. |
| `band` | package_band | `50k_150k` (5 + 5 hours, $1,750), `150k_500k` (10 + 10, $3,500), `500k_plus` (20 + 20, $7,000). |
| `consulting_hours` | smallint | Consulting hours funded. |
| `technical_hours` | smallint | Hands-on hours funded. |
| `consulting_rate` | numeric | $150 an hour. |
| `technical_rate` | numeric | $200 an hour. |
| `amount` | numeric | Hours times rates. |
| `beta` | boolean | Approved before launch, drawn from the $100,000 beta budget. |
| `psa_stand_in` | boolean | Beta only: Cloud Cruz's partner solutions architect was the Level 2 person [91]. |
| `approved_at` | date | Approved by a person: mid-deal for a sourcing partner, at close for an implementer or influencer. |
| `paid_at` | date | Paid after go-live. Null if not yet paid. |

### `co_marketing_campaigns`

The co-marketing fund for Premier and Elite partners [77].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `CM0001`. |
| `partner_id` | text | References `partners.id`. |
| `size` | numeric | 3500, 5000 or 10000. |
| `status` | campaign_status | `submitted`, `approved`, `rejected`, `paid`. |
| `submitted_at` | date | Plan submitted. |
| `approved_at` | date | Plan approved. |
| `proof_at` | date | Proof of performance received. |
| `paid_at` | date | Paid. Set exactly when `paid`. |

### `program_costs`

Monthly program cost by category, January 2027 to March 2028. Every line is a sum of the rows in this database, so ROI reconciles exactly.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `period` | date | First day of the month. Primary key with `category`. |
| `category` | cost_category | `headcount` (9 people, flat), `commissions` (accruals earned that month, excluding reversed), `implementation_packages` (paid that month), `co_marketing` (paid that month), `exam_vouchers` (voucher exams that month at fee value), `tools`. |
| `amount` | numeric | Dollars. |

### `contributions`

Contribution points, approved by partner marketing, from Jul 1, 2027 [78, 82, 89].

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `CO00001`. |
| `partner_id` | text | References `partners.id`. |
| `person_id` | text | The author. References `partner_people.id`. |
| `type` | contribution_type | `community_answer` (5 points), `linkedin_post` (10), `article` (25). |
| `submitted_at` | date | Submitted for review. |
| `status` | review_status | `pending`, `approved`, `rejected`. |
| `reviewed_at` | date | Null exactly when `pending`. |
| `points` | smallint | Points awarded; 0 unless approved. |

### `support_tickets`

Partner questions [18, 19]. Most are answered by the Support Hub with no ticket; the rest become Zendesk tickets or urgent Slack escalations.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `ST00001`. |
| `partner_id` | text | References `partners.id`. |
| `account_id` | text | The customer it concerns, for technical and billing questions. |
| `category` | ticket_category | `onboarding`, `deal_registration`, `technical`, `commissions`, `credentials`, `billing`. |
| `channel` | ticket_channel | `support_hub` (answered by the AI Answer Engine with citations), `zendesk`, `slack` (urgent escalation to a person). |
| `opened_at` | timestamptz | When asked. |
| `resolved_at` | timestamptz | Null while open. |
| `answered_by_hub` | boolean | True exactly when `channel = 'support_hub'`. |
| `sla_met` | boolean | Resolved within target: 1 minute (Hub), 4 hours (Slack), 1 business day (Zendesk). Null while open. |

### `engagement_events`

Portal, cohort, course and comms activity [17, 46]. **Never counts as activity.** Salesforce shows the Slack, introw and email rows as Partner Touch records.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `E000001`. |
| `partner_id` | text | References `partners.id`. |
| `event` | engagement_event | `portal_login`, `cohort_session`, `webinar`, `course`, `slack_message`, `introw_message`, `email`. |
| `occurred_at` | timestamptz | When it happened. |

### `program_docs`

The Ecosystem Partner Program Guide, one row per section, built from the YAML rules so it can never disagree with the data. The Answer Engine retrieves from it.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | text | Primary key, `DOC01` to `DOC14`. |
| `title` | text | `Ecosystem Partner Program Guide`. |
| `version` | text | Guide version. |
| `section` | text | Section heading. |
| `body` | text | Section text. |
| `embedding` | vector(1024) | Null until build 4 picks an embedding model. |

### `agent_runs`

Every AI action that would change state waits here for a person. Not readable by the read-only role.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `id` | uuid | Primary key. |
| `demo` | text | `measurement`, `propensity`, `tier_agent`, `answer_engine`, `deal_triage`, `pdr_agent`. |
| `input` | jsonb | What the agent was given. |
| `output` | jsonb | What it proposed. |
| `model` | text | Model name. |
| `trace_id` | text | Trace link. |
| `reviewer` | text | Who approved or rejected. |
| `decision` | agent_decision | `pending`, `approved`, `edited`, `rejected`. |
| `created_at` | timestamptz | When the run happened. |

## Metric layer (views)

Build 2, the Measurement Layer, reads these views instead of the raw tables (migration `003_metrics.sql`, decisions 104 to 107). Won revenue is split into four credit buckets that never overlap, so the buckets always add up to total won revenue (decisions 105 and 107). "Ask the data" queries only these views, through the read-only role.

### `touch_weights`

How much each kind of partner touch counts when influenced credit is split (`attribution.yaml`).

| Column | Type | Allowed values and meaning |
|---|---|---|
| `touch_type` | touch_type | `referral`, `co_sell`, `implementation`, `influence`. |
| `weight` | numeric | Relative weight: referral 1.0, co_sell 0.6, implementation 0.4, influence 0.2. |

### `deal_credit`

One row per won deal, with the bucket its revenue counts in.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `opportunity_id` | text | The won deal. |
| `account_id` | text | The customer. |
| `pricing_plan` | pricing_plan | `self_serve`, `premium`, `enterprise`. |
| `acv` | numeric | Annual contract value in dollars (bookings). |
| `closed_on` | date | Day the deal closed. |
| `closed_month` | date | First day of the month it closed. |
| `go_live_at` | date | Day the customer went live, if they have. |
| `credit_bucket` | text | `partner_sourced` (a partner brought the deal), `marketplace` (sold through a cloud marketplace), `influenced` (direct deal a partner helped within 90 days of close), `direct` (no partner). |
| `credited_partner_id` | text | The sourcing partner, or the marketplace partner of record; empty for influenced and direct deals. |

### `influenced_credit`

For influenced deals only: each helping partner's share, split by touch weight. Shares on one deal add to 1.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `opportunity_id` | text | The influenced deal. |
| `partner_id` | text | A partner who helped. |
| `share` | numeric | This partner's share of the deal, 0 to 1. |
| `credited_acv` | numeric | `share` times the deal's ACV, in dollars. |
| `closed_month` | date | First day of the month the deal closed. |

### `collected_revenue`

Cash actually collected: paid invoices that were not refunded.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `invoice_id` | text | The invoice. |
| `opportunity_id` | text | The deal it bills. |
| `credit_bucket` | text | The deal's bucket, as in `deal_credit`. |
| `credited_partner_id` | text | As in `deal_credit`. |
| `amount` | numeric | Dollars collected. |
| `paid_at` | date | Day it was paid. |
| `paid_month` | date | First day of the month it was paid. |

### `customers_live`

The north star (decision 57): one row per customer in production through a partner as sourcing partner, partner of record or implementer.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `account_id` | text | The customer. |
| `first_live_on` | date | First day they were live through a partner. |
| `first_live_month` | date | First day of that month. |

### `monthly_costs`

Program cost by month and category, straight from `program_costs`. "Paid to partners" is commissions, implementation packages and co-marketing; "fully loaded" adds headcount, tools and exam vouchers (decision 106).

| Column | Type | Allowed values and meaning |
|---|---|---|
| `month` | date | First day of the month. |
| `category` | cost_category | `headcount`, `commissions`, `implementation_packages`, `co_marketing`, `exam_vouchers`, `tools`. |
| `amount` | numeric | Dollars. |

### `monthly_summary`

One row per month, the spine of the measurement page.

| Column | Type | Allowed values and meaning |
|---|---|---|
| `month` | date | First day of the month. |
| `new_customers_live` | bigint | Customers who first went live through a partner that month. |
| `customers_live_to_date` | bigint | Running total of the north star. |
| `sourced_acv` | numeric | Bookings that month in the `partner_sourced` bucket. |
| `marketplace_acv` | numeric | Bookings that month in the `marketplace` bucket. |
| `influenced_acv` | numeric | Bookings that month in the `influenced` bucket. |
| `direct_acv` | numeric | Bookings that month with no partner. |
| `partner_cash_collected` | numeric | Cash collected that month on deals in any partner bucket. |
| `program_cost` | numeric | Fully loaded program cost that month. |

## Metrics

Each metric uses the as-of date `2028-03-31`. "Credited" means a partner holds a `sourced`, `partner_of_record` or `implementer` row in `opportunity_partners` for the deal.

### The north star and Year-1 targets [57, 65, 66]

- **Customers live through partners (north star).** Distinct `account_id` on opportunities with `go_live_at` set and at least one credited partner. Target: 400.
- **Activated partners.** Partners with `first_live_customer_at` set. Target: about 250.
- **Activated within 90 days (monthly cohort rate).** For each signing month (`date_trunc('month', terms_accepted_at)`), partners with `first_live_customer_at - terms_accepted_at <= 90`, divided by partners in the cohort. Only cohorts 90+ days old count. Target: climbs to 40% (an exit rate) [90].
- **Time to live.** `first_live_customer_at - terms_accepted_at`, in days.
- **Customers live per team member.** The north star divided by 9. Target: 44+.
- **Support Hub deflection.** `answered_by_hub` share of `support_tickets`. Target: 60%.
- **Long tail with no human touch.** Automated-plan partners with no `outreach`, `person` or `office_hours` intervention in `onboarding_signals`, divided by all automated-plan partners. Target: 70%.

### Pipeline and revenue

- **Partner-sourced pipeline.** Sum of `amount` for opportunities with `source = 'partner_sourced'`. Filter by `created_at` for a period.
- **Partner-sourced revenue.** The same, limited to `won = true`, filtered by `closed_at`.
- **Partner-influenced revenue.** Won opportunities with a `referral`, `co_sell`, `implementation` or `influence` touch where `touched_at` is between `closed_at - interval '90 days'` and `closed_at`, on a direct deal (not partner-sourced and not marketplace), so it never overlaps the other buckets. Count each deal once (decisions 105, 107).
- **Influence credit per partner.** On each influenced deal, split `amount` across qualifying touches by touch weight: referral 1.0, co_sell 0.6, implementation 0.4, influence 0.2.
- **Marketplace revenue.** Won opportunities with `source = 'marketplace'`, credited to the `partner_of_record`.
- **Win rate.** Won deals divided by all closed deals, usually split by `source` or by whether a partner is on the deal.
- **Multi-partner deal.** An opportunity with two or more distinct credited partners. Credit, commission and the package each follow the role, not the deal [85].

### Partners

- **Active partner.** Sold, influenced or supported a customer in the last 90 days: a credited or sourced role on an opportunity created or closed in the period, or any deal touch in it. Engagement events never count.
- **Stale partner.** `status = 'active'`, some customer activity in the window, none in the last 90 days.
- **At risk, reactivation, alumni.** No customer activity for 90 days (at risk, internal only), 180 days (reactivation offer), 365 days (`status = 'alumni'`) [56].
- **Partner health** [54]. Four questions, each green, yellow or red; healthy means no red. *Selling:* a credited role or touch in the last 90 days. *Customers winning:* live customers, none churned. *People skilled:* active credentials. *Delivery clean:* support tickets, SLA and package results.
- **Onboarding stall.** A partner cold for 3 or more days in `onboarding_signals` with no human-touch intervention.

### Tiers [33, 47, 89, 92]

- **Certified person.** A person with a credential where `issued_at <= d`, `expires_at` is null or after `d`, and `last_product_use_at >= d - 90`.
- **Scorecard.** On date `d`: certified people; people with a sales and with a technical accreditation; people with Level 2+ and with Level 3; live joint customers (distinct credited accounts live by `d`); public references (distinct live credited accounts with `public_reference`); partner-sourced won revenue over the 12 months to `d`; approved contribution points over the 182 days to `d` (from Jan 1, 2026).

  | Tier | Certified people | Level 2+ | Level 3 | Live customers | References | Sourced revenue | Points | Commission | Free exams |
  |---|---|---|---|---|---|---|---|---|---|
  | Member | 0 | 0 | 0 | 0 | 0 | $0 | 0 | 10% | 5 |
  | Select | 4 (2 sales, 2 technical accredited) | 0 | 0 | 3 | 1 | $0 | 20 | 15% | 10 |
  | Premier | 10 | 3 | 0 | 10 | 3 | $175,000 | 50 | 20% | 10 |
  | Elite (invited) | 25 | 8 | 8 | 25 | 6 | $500,000 | 100 | 25% | 15 |

- **Promotion.** Checked on the 1st of each month; a partner moves to the highest tier its scorecard earns. Demotions only at the Dec 31 review with 90 days' notice.
- **Tier mismatch.** `partners.tier` differs from the highest tier the monthly checks earn. *Over-tiered* means the label is higher; *under-tiered* means lower.

### Deal registration [79]

- **Approval rate.** `approved` plus `expired` divided by all registrations with a decision.
- **Conversion rate.** Registrations with `opportunity_id` set, divided by approved plus expired.
- **SLA compliance.** Among answered registrations, the share with `responded_at <= sla_due_at`.
- **SLA breaches in progress.** `pending` registrations with `sla_due_at` before the as-of time.
- **Duplicate registration.** Same `account_id` and `product` as an earlier registration from a different partner within 30 days.
- **Direct-versus-partner conflict.** A registration with no opportunity, submitted while a `direct` opportunity on the same account was open. Should be rejected with reason `existing_direct_opportunity`.

### Money [21, 61, 72 to 77]

- **Commissions earned.** Sum of `commission_accruals.amount` excluding `reversed`, by `earned_at`.
- **Commission liability.** Accruals with status `held` or `earned`: owed, not yet paid.
- **Early release.** An accrual with `released_at < hold_until`. Should never happen.
- **Package without Level 2.** A package whose `credential_id` is null or not an active Level 2 or 3 technical credential on `approved_at`, unless `psa_stand_in`. Should never happen.
- **Beta package spend.** Sum of `amount` where `beta`, against the $100,000 budget.
- **Total program cost.** Sum of `program_costs.amount`.
- **Program ROI.** `(partner-sourced revenue + marketplace revenue - total program cost) / total program cost`. Influenced revenue is reported beside ROI, never added in, so no dollar counts twice.
- **Cost per customer live through partners.** Total program cost divided by the north star.
