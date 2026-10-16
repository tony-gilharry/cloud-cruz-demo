-- Ecosystem Partner Program: the Year-1 schema.
--
-- Cloud Cruz's partner program, from the 90-day beta (Jan 1, 2027) through
-- Year 1 (Mar 31, 2028), on a fictional calendar. Every table follows a decision in DECISIONS.md;
-- the data dictionary documents every column.
--
-- Everything lives in its own `ecosystem` schema so a reset can drop and
-- rebuild it without touching anything else in the database, and so
-- Supabase's auto-generated API (which serves `public`) never exposes it.
-- Evaluation labels live in a separate `eval` schema the read-only role
-- cannot see. The database is reset, never migrated (decision 86).

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create schema ecosystem;
create schema eval;

set search_path = ecosystem, extensions;

-- Closed lists are enums so bad values fail at insert time, and so the AI
-- reading the schema sees the allowed values directly.
create type partner_type         as enum ('agency', 'SI', 'ISV', 'tech', 'reseller');
create type partner_segment      as enum ('anchor', 'scale', 'specialist', 'builder');
create type partner_path         as enum ('services', 'technology');
create type partner_tier         as enum ('Member', 'Select', 'Premier', 'Elite');
create type partner_status       as enum ('active', 'alumni');
create type region               as enum ('us', 'canada', 'latam', 'uk_ireland', 'anz');
create type team_role            as enum ('head_of_partner_ops', 'pdr', 'partner_manager', 'partner_account_manager',
                                          'partner_solutions_architect', 'enablement', 'partner_operations', 'partner_marketing');
create type lead_motion          as enum ('inbound', 'outbound');
create type lead_temperature     as enum ('nurture', 'warm', 'hot', 'urgent');
create type lead_route           as enum ('person', 'agent_draft', 'nurture');
create type lead_outcome         as enum ('open', 'converted', 'nurture', 'disqualified');
create type stated_timeline      as enum ('now', 'this_quarter', 'later');
create type fit_outcome          as enum ('auto_approved', 'human_review');
create type agreement_path       as enum ('click_through', 'procurement');
create type onboarding_plan      as enum ('standard_30', 'accelerated', 'automated');
create type health_state         as enum ('cold', 'warm', 'hot');
create type intervention         as enum ('none', 'nudge', 'outreach', 'person', 'office_hours', 'fast_track');
create type person_role          as enum ('executive_sponsor', 'technical_lead', 'sales_lead', 'technical', 'business');
create type account_segment      as enum ('smb', 'midmarket', 'enterprise');
create type pricing_plan         as enum ('self_serve', 'premium', 'enterprise');
create type opportunity_stage    as enum ('prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost');
create type opportunity_source   as enum ('partner_sourced', 'direct', 'marketplace');
create type cloud_marketplace    as enum ('aws', 'gcp', 'azure');
create type partner_role         as enum ('sourced', 'influenced', 'implementer', 'partner_of_record');
create type deal_reg_status      as enum ('pending', 'approved', 'rejected', 'expired');
create type product              as enum ('warehouse', 'pipelines', 'agents', 'governance');
create type touch_type           as enum ('referral', 'co_sell', 'implementation', 'influence');
create type engagement_event     as enum ('portal_login', 'cohort_session', 'webinar', 'course', 'slack_message', 'introw_message', 'email');
create type credential_step      as enum ('sales_accreditation', 'technical_accreditation', 'level_1', 'level_2', 'level_3');
create type credential_track     as enum ('technical', 'business');
create type exam_payment         as enum ('voucher', 'partner');
create type voucher_source       as enum ('tier', 'accelerated_plan', 'anchor');
create type commission_mechanism as enum ('per_invoice', 'annualized', 'spiff');
create type spiff_trigger        as enum ('first_customer_live', 'first_enterprise_live', 'retained_12_months');
create type accrual_status       as enum ('earned', 'held', 'released', 'reversed');
create type package_band         as enum ('50k_150k', '150k_500k', '500k_plus');
create type ticket_category      as enum ('onboarding', 'deal_registration', 'technical', 'commissions', 'credentials', 'billing');
create type ticket_channel       as enum ('support_hub', 'zendesk', 'slack');
create type campaign_status      as enum ('submitted', 'approved', 'rejected', 'paid');
create type contribution_type    as enum ('community_answer', 'linkedin_post', 'article');
create type review_status        as enum ('pending', 'approved', 'rejected');
create type tier_change_reason   as enum ('signed', 'promoted', 'label');
create type cost_category        as enum ('headcount', 'commissions', 'implementation_packages', 'co_marketing', 'exam_vouchers', 'tools');
create type agent_decision       as enum ('pending', 'approved', 'edited', 'rejected');

-- ---------------------------------------------------------------------------
-- People and partners

-- The partner team: 9 people all year (decision 66). AEs sit in sales and
-- appear only as account owners.
create table team_members (
  id    text primary key,                            -- U01
  name  text not null unique,
  role  team_role not null
);

-- Stage 0, Develop: every firm the PDR worked, converted or not
-- (decisions 34 to 36, 68 to 70).
create table partner_leads (
  id                   text primary key,             -- L00001
  company              text not null unique,
  type                 partner_type not null,
  segment              partner_segment not null,
  region               region not null,
  motion               lead_motion not null,
  owner_id             text not null references team_members (id),
  created_at           timestamptz not null,
  fit_score            smallint not null check (fit_score between 0 and 100),
  -- Intent components (decision 68). The total is their sum before decay.
  intent_application   smallint not null check (intent_application in (0, 30)),
  intent_meeting       smallint not null check (intent_meeting in (0, 20)),
  intent_timeline      smallint not null check (intent_timeline in (0, 10, 20)),
  intent_events        smallint not null check (intent_events in (0, 10, 20)),
  intent_content       smallint not null check (intent_content between 0 and 10),
  intent_score         smallint not null check (intent_score between 0 and 100),
  last_signal_at       timestamptz not null,
  deal_in_hand         boolean not null,
  temperature          lead_temperature not null,
  route                lead_route not null,
  -- The typed judgment behind intent_timeline (decision 69).
  stated_timeline      stated_timeline,
  judgment_confidence  numeric(3, 2) check (judgment_confidence between 0 and 1),
  judgment_model       text,
  judged_at            timestamptz,
  human_review         boolean not null,                -- low confidence, sent to a person
  audited              boolean not null,                -- in the random 5% weekly audit
  meeting_at           timestamptz,
  handoff_at           timestamptz,
  outcome              lead_outcome not null,
  check (intent_score = intent_application + intent_meeting + intent_timeline + intent_events + intent_content),
  check (not deal_in_hand or temperature = 'urgent'),
  check ((stated_timeline is null) = (judged_at is null))
);

create table partners (
  id                          text primary key,      -- P0001
  name                        text not null unique,
  lead_id                     text not null unique references partner_leads (id),
  type                        partner_type not null,
  segment                     partner_segment not null,
  path                        partner_path not null,
  region                      region not null,
  beta                        boolean not null,      -- one of the 25 design partners
  fit_score                   smallint not null check (fit_score between 0 and 100),
  fit_outcome                 fit_outcome not null,
  review_reason               text,                  -- logged when a person admitted a 50 to 69
  applied_at                  date not null,
  accepted_at                 date not null,
  agreement_path              agreement_path not null,
  terms_accepted_at           date not null,
  onboarding_plan             onboarding_plan not null,
  partner_manager_id          text not null references team_members (id),
  partner_account_manager_id  text references team_members (id), -- managed partners only
  onboarded_at                date,
  -- Activation milestones (decision 43), computed from the deals below.
  first_deal_registration_at  date,
  first_closed_won_at         date,
  first_live_customer_at      date,
  activation_rating           health_state,
  tier                        partner_tier not null, -- current label
  elite_invited               boolean not null,
  status                      partner_status not null,
  alumni_at                   date,
  delivery_maturity           smallint not null check (delivery_maturity between 1 and 5),
  avg_project_value           numeric(12, 2) not null check (avg_project_value >= 0),
  check (accepted_at >= applied_at and terms_accepted_at >= accepted_at),
  check ((fit_outcome = 'human_review') = (review_reason is not null)),
  check ((status = 'alumni') = (alumni_at is not null)),
  check (tier <> 'Elite' or elite_invited)
);

-- Named people at each partner: the three onboarding contacts plus everyone
-- who earns a credential.
create table partner_people (
  id          text primary key,                      -- PP00001
  partner_id  text not null references partners (id),
  name        text not null,
  role        person_role not null,
  added_at    date not null
);

-- One row per partner per day from terms accepted until onboarded, or until
-- 14 days past its ceiling (decisions 41, 46).
create table onboarding_signals (
  partner_id          text not null references partners (id),
  day                 date not null,
  day_number          smallint not null check (day_number >= 1),
  logged_in           boolean not null,                -- first portal login has happened
  checklist_pct       smallint not null check (checklist_pct between 0 and 100),
  plan_pct            smallint not null check (plan_pct between 0 and 100),
  accreditations      smallint not null check (accreditations >= 0),
  sandbox_builds      smallint not null check (sandbox_builds >= 0),
  cohort_sessions     smallint not null check (cohort_sessions >= 0),
  slack_active        boolean not null,
  crossbeam_overlaps  smallint not null check (crossbeam_overlaps >= 0),
  deal_registered     boolean not null,
  health              health_state not null,
  intervention        intervention not null,
  primary key (partner_id, day)
);

-- ---------------------------------------------------------------------------
-- Customers and deals

create table accounts (
  id         text primary key,                       -- A0001
  name       text not null unique,
  segment    account_segment not null,
  region     region not null,
  employees  integer not null check (employees > 0),
  owner      text not null                           -- the AE who owns the customer
);

create table opportunities (
  id                     text primary key,           -- O000001
  account_id             text not null references accounts (id),
  pricing_plan           pricing_plan not null,
  amount                 numeric(12, 2) not null check (amount > 0), -- annual contract value
  term_months            smallint not null check (term_months between 1 and 36),
  stage                  opportunity_stage not null,
  created_at             timestamptz not null,
  closed_at              timestamptz,
  won                    boolean,                    -- null while open
  go_live_at             date,                       -- customer in production
  source                 opportunity_source not null,
  sourcing_partner_id    text references partners (id), -- the partner that is paid
  marketplace            cloud_marketplace,
  competitive_migration  boolean not null,
  public_reference       boolean not null,           -- the customer agreed to be a public reference (decision 33)
  -- Keep the row internally consistent so metrics never need defensive SQL.
  check ((closed_at is null) = (won is null)),
  check ((stage in ('closed_won', 'closed_lost')) = (closed_at is not null)),
  check (won is null or won = (stage = 'closed_won')),
  check (go_live_at is null or won),
  check (not public_reference or go_live_at is not null),
  check ((source = 'partner_sourced') = (sourcing_partner_id is not null)),
  check ((source = 'marketplace') = (marketplace is not null))
);

-- One row per partner per deal, with its role (decision 85). A deal can have
-- one partner that sourced it and another that implemented it.
create table opportunity_partners (
  opportunity_id  text not null references opportunities (id),
  partner_id      text not null references partners (id),
  role            partner_role not null,
  added_at        timestamptz not null,
  primary key (opportunity_id, partner_id, role)
);

create table deal_registrations (
  id              text primary key,                  -- DR00001
  partner_id      text not null references partners (id),
  account_id      text not null references accounts (id),
  opportunity_id  text references opportunities (id), -- set once converted
  submitted_at    timestamptz not null,
  amount          numeric(12, 2) not null check (amount > 0),
  product         product not null,
  status          deal_reg_status not null,
  reason          text,
  sla_due_at      timestamptz not null,              -- 2 business days (decision 79)
  responded_at    timestamptz,
  check ((status = 'pending') = (responded_at is null))
);

-- The partner activity attribution reads: referrals, co-selling,
-- implementation and influence on a specific deal.
create table deal_touches (
  id              text primary key,                  -- T000001
  opportunity_id  text not null references opportunities (id),
  partner_id      text not null references partners (id),
  touch_type      touch_type not null,
  touched_at      timestamptz not null
);

-- Billing. A commission is earned only on a paid invoice (decision 21).
create table invoices (
  id              text primary key,                  -- INV000001
  opportunity_id  text not null references opportunities (id),
  account_id      text not null references accounts (id),
  period_start    date not null,
  amount          numeric(12, 2) not null check (amount > 0),
  issued_at       date not null,
  paid_at         date,
  refunded_at     date,
  check (paid_at is null or paid_at >= issued_at),
  check (refunded_at is null or refunded_at >= paid_at)
);

-- ---------------------------------------------------------------------------
-- Enablement

-- The five-step ladder (decisions 27, 47, 80). Accreditations never expire;
-- Levels last 12 months.
create table credentials (
  id                   text primary key,             -- CR00001
  person_id            text not null references partner_people (id),
  partner_id           text not null references partners (id),
  step                 credential_step not null,
  track                credential_track,
  issuer               text not null,                -- Credly in production (decision 22)
  issued_at            date not null,
  expires_at           date,
  last_product_use_at  date,
  check ((step in ('sales_accreditation', 'technical_accreditation')) = (expires_at is null)),
  check ((step in ('sales_accreditation', 'technical_accreditation')) = (track is null)),
  check (expires_at is null or expires_at > issued_at)
);

-- Proctored Level exams through Pearson VUE (decisions 81, 83).
create table exam_attempts (
  id              text primary key,                  -- EX00001
  person_id       text not null references partner_people (id),
  partner_id      text not null references partners (id),
  step            credential_step not null check (step in ('level_1', 'level_2', 'level_3')),
  track           credential_track not null,
  attempted_at    date not null,
  fee             numeric(8, 2) not null check (fee > 0),
  passed          boolean not null,
  paid_by         exam_payment not null,
  voucher_source  voucher_source,
  check ((paid_by = 'voucher') = (voucher_source is not null))
);

create table tier_history (
  id          text primary key,                      -- H00001
  partner_id  text not null references partners (id),
  tier        partner_tier not null,
  reason      tier_change_reason not null,
  changed_at  date not null
);

-- ---------------------------------------------------------------------------
-- Money

-- The commission ledger (decisions 21, 24, 72 to 76, 85, 88): earned on a
-- paid invoice, held 60 days, then released; reversed on a 90-day refund.
create table commission_accruals (
  id              text primary key,                  -- CA00001
  partner_id      text not null references partners (id),
  opportunity_id  text not null references opportunities (id),
  role            partner_role not null,
  invoice_id      text references invoices (id),     -- null for SPIFFs
  mechanism       commission_mechanism not null,
  spiff_trigger   spiff_trigger,
  rate            numeric(5, 4) check (rate > 0 and rate < 1), -- locked at close; null for SPIFFs
  amount          numeric(12, 2) not null check (amount >= 0),
  status          accrual_status not null,
  earned_at       date not null,
  hold_until      date not null,
  released_at     date,
  reversed_at     date,
  check ((mechanism = 'spiff') = (spiff_trigger is not null)),
  check ((mechanism = 'spiff') = (rate is null)),
  check ((mechanism = 'spiff') = (invoice_id is null)),
  check ((status = 'released') = (released_at is not null)),
  check ((status = 'reversed') = (reversed_at is not null))
);

-- Cloud Cruz pays for a partner's first hours on an Enterprise deal it sourced,
-- implemented or influenced (decisions 45, 53, 61, 91, 94).
create table implementation_packages (
  id                text primary key,                -- IP0001
  opportunity_id    text not null references opportunities (id),
  partner_id        text not null references partners (id),
  credential_id     text references credentials (id), -- the Level 2 technical person
  band              package_band not null,
  consulting_hours  smallint not null check (consulting_hours > 0),
  technical_hours   smallint not null check (technical_hours > 0),
  consulting_rate   numeric(8, 2) not null check (consulting_rate > 0),
  technical_rate    numeric(8, 2) not null check (technical_rate > 0),
  amount            numeric(12, 2) not null check (amount > 0),
  beta              boolean not null,                -- drawn from the $100,000 beta budget
  psa_stand_in      boolean not null,                -- beta only: Cloud Cruz's PSA is the Level 2 person (decision 91)
  approved_at       date not null,
  paid_at           date,
  check (amount = consulting_hours * consulting_rate + technical_hours * technical_rate)
);

-- Co-marketing fund, Premier and above (decision 77).
create table co_marketing_campaigns (
  id            text primary key,                    -- CM0001
  partner_id    text not null references partners (id),
  size          numeric(8, 2) not null check (size in (3500, 5000, 10000)),
  status        campaign_status not null,
  submitted_at  date not null,
  approved_at   date,
  proof_at      date,                                -- proof of performance received
  paid_at       date,
  check ((status = 'paid') = (paid_at is not null)),
  check (paid_at is null or proof_at is not null)
);

create table program_costs (
  period    date not null,                           -- first day of the month
  category  cost_category not null,
  amount    numeric(12, 2) not null check (amount >= 0),
  primary key (period, category)
);

-- ---------------------------------------------------------------------------
-- Community and support

-- Contribution points, approved by partner marketing (decisions 78, 82, 89).
create table contributions (
  id            text primary key,                    -- CO00001
  partner_id    text not null references partners (id),
  person_id     text not null references partner_people (id),
  type          contribution_type not null,
  submitted_at  date not null,
  status        review_status not null,
  reviewed_at   date,
  points        smallint not null check (points >= 0), -- 0 unless approved
  check ((status = 'pending') = (reviewed_at is null)),
  check (status = 'approved' or points = 0)
);

-- Partner questions. Most are answered by the Support Hub with no ticket;
-- the rest become Zendesk tickets or urgent Slack escalations (decisions 18, 19).
create table support_tickets (
  id               text primary key,                 -- ST00001
  partner_id       text not null references partners (id),
  account_id       text references accounts (id),
  category         ticket_category not null,
  channel          ticket_channel not null,
  opened_at        timestamptz not null,
  resolved_at      timestamptz,
  answered_by_hub  boolean not null,
  sla_met          boolean,                          -- null while open
  check (answered_by_hub = (channel = 'support_hub')),
  check ((resolved_at is null) = (sla_met is null))
);

-- Portal, cohort, course and comms activity. Shown for context; never
-- counts as activity (decisions 17, 46).
create table engagement_events (
  id           text primary key,                     -- E000001
  partner_id   text not null references partners (id),
  event        engagement_event not null,
  occurred_at  timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Program guide and agent logs

create table program_docs (
  id         text primary key,                       -- DOC01
  title      text not null,
  version    text not null,
  section    text not null,
  body       text not null,
  -- 1024 dimensions to start. The embedding model is picked in build 4, and
  -- changing the size is a one-line change. Null until then.
  embedding  vector(1024)
);

create table agent_runs (
  id          uuid primary key default gen_random_uuid(),
  demo        text not null check (demo in ('measurement', 'propensity', 'tier_agent', 'answer_engine', 'deal_triage', 'pdr_agent')),
  input       jsonb not null,
  output      jsonb,
  model       text not null,
  trace_id    text,
  reviewer    text,                                  -- who approved or rejected
  decision    agent_decision not null default 'pending',
  created_at  timestamptz not null default now()
);

-- Indexes on the joins and time filters every metric uses.
create index on partner_leads (created_at);
create index on partners (segment);
create index on partner_people (partner_id);
create index on opportunities (account_id);
create index on opportunities (sourcing_partner_id);
create index on opportunities (closed_at);
create index on opportunity_partners (partner_id);
create index on deal_registrations (partner_id);
create index on deal_registrations (account_id);
create index on deal_touches (opportunity_id);
create index on deal_touches (partner_id, touched_at);
create index on invoices (opportunity_id);
create index on credentials (partner_id);
create index on exam_attempts (partner_id);
create index on tier_history (partner_id, changed_at);
create index on commission_accruals (partner_id);
create index on commission_accruals (opportunity_id);
create index on implementation_packages (partner_id);
create index on contributions (partner_id);
create index on support_tickets (partner_id, opened_at);
create index on engagement_events (partner_id, occurred_at);

-- Evaluation labels: which rows are seeded scenarios. Evals join on
-- (entity_type, entity_id). The read-only role has no access to this schema.
create table eval._eval_tags (
  id           serial primary key,
  entity_type  text not null,       -- partner, deal_registration, credential, ...
  entity_id    text not null,
  tag          text not null,
  note         text
);
create index on eval._eval_tags (tag);
