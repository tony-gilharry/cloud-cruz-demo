// Builds the whole synthetic Year-1 dataset in memory, then writes it in one
// transaction. Generation order matters: each step depends on the ones
// before it, and changing the order changes every random draw after it.
import type pg from "pg";
import { AS_OF, DAY, LAUNCH, SEED, WINDOW_START, id, program, tierRank } from "./config.ts";
import { insertRows } from "../db/client.ts";
import {
  SEEDED, computeEvalTags, emptySeeded, planIgnoredStalls, planStalePartners, planTierMismatches,
  seedDirectConflicts, seedDuplicateRegistrations, seedEarlyReleases, seedPackagesWithoutL2, type Seeded,
} from "./edge-cases.ts";
import { generateAccounts } from "./generate/accounts.ts";
import { generateContributions, generateEngagement, generateTickets } from "./generate/community.ts";
import { generateCredentials } from "./generate/credentials.ts";
import { generateProgramDocs } from "./generate/docs.ts";
import { generateFunnel, generateTeam } from "./generate/funnel.ts";
import { generateInvoices } from "./generate/invoices.ts";
import { LIVE_ROLES, computeMilestones } from "./generate/milestones.ts";
import {
  generateAccruals, generateCampaigns, generatePackages, generateProgramCosts, generateSpiffs,
  settleExamPayments, withAccrualIds, withPackageIds,
} from "./generate/money.ts";
import { HUMAN_TOUCH, buildSignals, generatePeople, planOnboarding } from "./generate/onboarding.ts";
import { generatePipeline } from "./generate/pipeline.ts";
import { addLabelOverrides, buildTierHistory, tierInputs, withTierIds } from "./generate/tiers.ts";
import { createRng } from "./rng.ts";
import type { Dataset, Opportunity, TierChange } from "./types.ts";

export interface Generated {
  data: Dataset;
  seeded: Seeded;
}

export function generateDataset(): Generated {
  const rng = createRng(SEED);
  const seeded = emptySeeded();

  // 1. The team, the lead funnel and the partners it produced (Stages 0 and 1).
  const team = generateTeam(rng);
  const { leads, partners } = generateFunnel(rng, team);
  planStalePartners(rng, partners, seeded);   // before any deals exist
  const people = generatePeople(rng, partners);
  const paces = planOnboarding(rng, partners);

  // 2. Accounts and deals, then the milestones those deals produce (Stages 3 and 5).
  const accounts = generateAccounts(rng);
  const pipeline = generatePipeline(rng, partners, accounts);
  for (const o of pipeline.twoPartner) seeded.opportunities.add(o);
  seedDuplicateRegistrations(rng, pipeline.dealRegistrations, partners, seeded);
  seedDirectConflicts(rng, pipeline.dealRegistrations, pipeline.opportunities, partners, seeded);
  const dealRegistrations = withIds(pipeline.dealRegistrations, "DR", 5, (r) => r.submitted_at);
  const touches = withIds(pipeline.touches, "T", 6, (t) => t.touched_at);
  const roster = pipeline.roster;
  const milestones = computeMilestones(partners, pipeline.opportunities, roster, dealRegistrations, touches);

  // 3. Daily onboarding health, now that first deal registrations are known (Stage 2).
  const ignored = planIgnoredStalls(rng, partners, paces, seeded);
  const onboardingSignals = buildSignals(rng, partners, paces, milestones.firstDealReg, ignored);

  // 4. Billing, credentials and contributions, which tiers are scored on (Stage 4).
  const invoices = generateInvoices(rng, pipeline.opportunities);
  const { liveDates, wonDates } = creditedDates(pipeline.opportunities, roster);
  const { credentials, examAttempts } = generateCredentials(rng, partners, people, paces, liveDates, wonDates);
  const contributions = generateContributions(rng, partners, people);

  // 5. Tiers follow counts, except for the seeded mismatches.
  const inputs = tierInputs(credentials, pipeline.opportunities, roster, contributions);
  const { overrides, neverPromoted } = planTierMismatches(rng, partners, inputs, seeded);
  const tierRows = buildTierHistory(partners, inputs, neverPromoted);
  addLabelOverrides(tierRows, partners, overrides);
  const tierHistory = withTierIds(tierRows);
  const history = byPartner(tierHistory);

  // 6. Money, community and support (Stages 5 to 7).
  settleExamPayments(examAttempts, partners, history);
  const accrualDrafts = [
    ...generateAccruals(pipeline.opportunities, roster, invoices, history),
    ...generateSpiffs(partners, pipeline.opportunities, roster, invoices),
  ];
  seedEarlyReleases(rng, accrualDrafts, seeded);
  const accruals = withAccrualIds(accrualDrafts);
  const packageDrafts = generatePackages(rng, pipeline.opportunities, roster, credentials);
  seedPackagesWithoutL2(rng, packageDrafts, pipeline.opportunities, seeded);
  const packages = withPackageIds(packageDrafts);
  const campaigns = generateCampaigns(rng, partners, history);
  const tickets = generateTickets(rng, partners, accountsByPartner(pipeline.opportunities, roster));
  const engagementEvents = generateEngagement(rng, partners, paces);
  const programCosts = generateProgramCosts(accruals, packages, campaigns, examAttempts);

  const data: Dataset = {
    team, leads, partners, people, onboardingSignals, accounts, opportunities: pipeline.opportunities,
    opportunityPartners: roster, dealRegistrations, touches, invoices, credentials, examAttempts, tierHistory,
    accruals, packages, campaigns, programCosts, contributions, tickets, engagementEvents,
    programDocs: generateProgramDocs(), evalTags: [],
  };
  data.evalTags = computeEvalTags(data, seeded, inputs);
  return { data, seeded };
}

/**
 * Sort by time and hand out readable ids in that order. Rows are updated in
 * place so the seeded-case sets, which hold references, still match.
 */
function withIds<T extends object>(rows: T[], prefix: string, width: number, time: (row: T) => number): (T & { id: string })[] {
  return [...rows]
    .sort((a, b) => time(a) - time(b))
    .map((row, i) => Object.assign(row, { id: id(prefix, i + 1, width) }));
}

/** Go-live and close dates of each partner's credited deals, in order. */
function creditedDates(opportunities: Opportunity[], roster: Dataset["opportunityPartners"]) {
  const opps = new Map(opportunities.map((o) => [o.id, o]));
  const liveDates = new Map<string, number[]>();
  const wonDates = new Map<string, number[]>();
  for (const r of roster) {
    if (!LIVE_ROLES.has(r.role)) continue;
    const o = opps.get(r.opportunity_id)!;
    if (o.won) wonDates.set(r.partner_id, [...(wonDates.get(r.partner_id) ?? []), o.closed_at!]);
    if (o.go_live_at !== null && o.go_live_at <= AS_OF) liveDates.set(r.partner_id, [...(liveDates.get(r.partner_id) ?? []), o.go_live_at]);
  }
  for (const list of [...liveDates.values(), ...wonDates.values()]) list.sort((a, b) => a - b);
  return { liveDates, wonDates };
}

function accountsByPartner(opportunities: Opportunity[], roster: Dataset["opportunityPartners"]): Map<string, string[]> {
  const opps = new Map(opportunities.map((o) => [o.id, o]));
  const out = new Map<string, string[]>();
  for (const r of roster) out.set(r.partner_id, [...(out.get(r.partner_id) ?? []), opps.get(r.opportunity_id)!.account_id]);
  return out;
}

function byPartner(history: TierChange[]): Map<string, TierChange[]> {
  const out = new Map<string, TierChange[]>();
  for (const h of history) out.set(h.partner_id, [...(out.get(h.partner_id) ?? []), h]);
  return out;
}

// ---------------------------------------------------------------------------
// Writing

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const date = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));

/** Table name, column list and row mapper for every generated table, in foreign-key order. */
function tables(d: Dataset): [string, string[], unknown[][]][] {
  return [
    ["team_members", ["id", "name", "role"], d.team.map((t) => [t.id, t.name, t.role])],
    ["partner_leads",
      ["id", "company", "type", "segment", "region", "motion", "owner_id", "created_at", "fit_score", "intent_application",
        "intent_meeting", "intent_timeline", "intent_events", "intent_content", "intent_score", "last_signal_at", "deal_in_hand",
        "temperature", "route", "stated_timeline", "judgment_confidence", "judgment_model", "judged_at", "human_review", "audited",
        "meeting_at", "handoff_at", "outcome"],
      d.leads.map((l) => [l.id, l.company, l.type, l.segment, l.region, l.motion, l.owner_id, iso(l.created_at), l.fit_score,
        l.intent_application, l.intent_meeting, l.intent_timeline, l.intent_events, l.intent_content, l.intent_score,
        iso(l.last_signal_at), l.deal_in_hand, l.temperature, l.route, l.stated_timeline, l.judgment_confidence, l.judgment_model,
        iso(l.judged_at), l.human_review, l.audited, iso(l.meeting_at), iso(l.handoff_at), l.outcome])],
    ["partners",
      ["id", "name", "lead_id", "type", "segment", "path", "region", "beta", "fit_score", "fit_outcome", "review_reason", "applied_at",
        "accepted_at", "agreement_path", "terms_accepted_at", "onboarding_plan", "partner_manager_id", "partner_account_manager_id",
        "onboarded_at", "first_deal_registration_at", "first_closed_won_at", "first_live_customer_at", "activation_rating", "tier",
        "elite_invited", "status", "alumni_at", "delivery_maturity", "avg_project_value"],
      d.partners.map((p) => [p.id, p.name, p.lead_id, p.type, p.segment, p.path, p.region, p.beta, p.fit_score, p.fit_outcome,
        p.review_reason, date(p.applied_at), date(p.accepted_at), p.agreement_path, date(p.terms_accepted_at), p.onboarding_plan,
        p.partner_manager_id, p.partner_account_manager_id, date(p.onboarded_at), date(p.first_deal_registration_at),
        date(p.first_closed_won_at), date(p.first_live_customer_at), p.activation_rating, p.tier, p.elite_invited, p.status,
        date(p.alumni_at), p.delivery_maturity, p.avg_project_value])],
    ["partner_people", ["id", "partner_id", "name", "role", "added_at"],
      d.people.map((x) => [x.id, x.partner_id, x.name, x.role, date(x.added_at)])],
    ["onboarding_signals",
      ["partner_id", "day", "day_number", "logged_in", "checklist_pct", "plan_pct", "accreditations", "sandbox_builds",
        "cohort_sessions", "slack_active", "crossbeam_overlaps", "deal_registered", "health", "intervention"],
      d.onboardingSignals.map((s) => [s.partner_id, date(s.day), s.day_number, s.logged_in, s.checklist_pct, s.plan_pct,
        s.accreditations, s.sandbox_builds, s.cohort_sessions, s.slack_active, s.crossbeam_overlaps, s.deal_registered,
        s.health, s.intervention])],
    ["accounts", ["id", "name", "segment", "region", "employees", "owner"],
      d.accounts.map((a) => [a.id, a.name, a.segment, a.region, a.employees, a.owner])],
    ["opportunities",
      ["id", "account_id", "pricing_plan", "amount", "term_months", "stage", "created_at", "closed_at", "won", "go_live_at", "source",
        "sourcing_partner_id", "marketplace", "competitive_migration", "public_reference"],
      d.opportunities.map((o) => [o.id, o.account_id, o.pricing_plan, o.amount, o.term_months, o.stage, iso(o.created_at),
        iso(o.closed_at), o.won, date(o.go_live_at), o.source, o.sourcing_partner_id, o.marketplace, o.competitive_migration,
        o.public_reference])],
    ["opportunity_partners", ["opportunity_id", "partner_id", "role", "added_at"],
      d.opportunityPartners.map((r) => [r.opportunity_id, r.partner_id, r.role, iso(r.added_at)])],
    ["deal_registrations",
      ["id", "partner_id", "account_id", "opportunity_id", "submitted_at", "amount", "product", "status", "reason", "sla_due_at", "responded_at"],
      d.dealRegistrations.map((r) => [r.id, r.partner_id, r.account_id, r.opportunity_id, iso(r.submitted_at), r.amount, r.product,
        r.status, r.reason, iso(r.sla_due_at), iso(r.responded_at)])],
    ["deal_touches", ["id", "opportunity_id", "partner_id", "touch_type", "touched_at"],
      d.touches.map((t) => [t.id, t.opportunity_id, t.partner_id, t.touch_type, iso(t.touched_at)])],
    ["invoices", ["id", "opportunity_id", "account_id", "period_start", "amount", "issued_at", "paid_at", "refunded_at"],
      d.invoices.map((i) => [i.id, i.opportunity_id, i.account_id, date(i.period_start), i.amount, date(i.issued_at), date(i.paid_at), date(i.refunded_at)])],
    ["credentials", ["id", "person_id", "partner_id", "step", "track", "issuer", "issued_at", "expires_at", "last_product_use_at"],
      d.credentials.map((c) => [c.id, c.person_id, c.partner_id, c.step, c.track, c.issuer, date(c.issued_at), date(c.expires_at), date(c.last_product_use_at)])],
    ["exam_attempts", ["id", "person_id", "partner_id", "step", "track", "attempted_at", "fee", "passed", "paid_by", "voucher_source"],
      d.examAttempts.map((e) => [e.id, e.person_id, e.partner_id, e.step, e.track, date(e.attempted_at), e.fee, e.passed, e.paid_by, e.voucher_source])],
    ["tier_history", ["id", "partner_id", "tier", "reason", "changed_at"],
      d.tierHistory.map((h) => [h.id, h.partner_id, h.tier, h.reason, date(h.changed_at)])],
    ["commission_accruals",
      ["id", "partner_id", "opportunity_id", "role", "invoice_id", "mechanism", "spiff_trigger", "rate", "amount", "status",
        "earned_at", "hold_until", "released_at", "reversed_at"],
      d.accruals.map((a) => [a.id, a.partner_id, a.opportunity_id, a.role, a.invoice_id, a.mechanism, a.spiff_trigger, a.rate,
        a.amount, a.status, date(a.earned_at), date(a.hold_until), date(a.released_at), date(a.reversed_at)])],
    ["implementation_packages",
      ["id", "opportunity_id", "partner_id", "credential_id", "band", "consulting_hours", "technical_hours", "consulting_rate",
        "technical_rate", "amount", "beta", "psa_stand_in", "approved_at", "paid_at"],
      d.packages.map((p) => [p.id, p.opportunity_id, p.partner_id, p.credential_id, p.band, p.consulting_hours, p.technical_hours,
        p.consulting_rate, p.technical_rate, p.amount, p.beta, p.psa_stand_in, date(p.approved_at), date(p.paid_at)])],
    ["co_marketing_campaigns", ["id", "partner_id", "size", "status", "submitted_at", "approved_at", "proof_at", "paid_at"],
      d.campaigns.map((c) => [c.id, c.partner_id, c.size, c.status, date(c.submitted_at), date(c.approved_at), date(c.proof_at), date(c.paid_at)])],
    ["program_costs", ["period", "category", "amount"], d.programCosts.map((c) => [date(c.period), c.category, c.amount])],
    ["contributions", ["id", "partner_id", "person_id", "type", "submitted_at", "status", "reviewed_at", "points"],
      d.contributions.map((c) => [c.id, c.partner_id, c.person_id, c.type, date(c.submitted_at), c.status, date(c.reviewed_at), c.points])],
    ["support_tickets", ["id", "partner_id", "account_id", "category", "channel", "opened_at", "resolved_at", "answered_by_hub", "sla_met"],
      d.tickets.map((t) => [t.id, t.partner_id, t.account_id, t.category, t.channel, iso(t.opened_at), iso(t.resolved_at), t.answered_by_hub, t.sla_met])],
    ["engagement_events", ["id", "partner_id", "event", "occurred_at"],
      d.engagementEvents.map((e) => [e.id, e.partner_id, e.event, iso(e.occurred_at)])],
    ["program_docs", ["id", "title", "version", "section", "body"],
      d.programDocs.map((x) => [x.id, x.title, x.version, x.section, x.body])],
  ];
}

export const GENERATED_TABLES = tables(emptyDataset()).map(([name]) => name);

/** Replaces all generated rows in one transaction. agent_runs is left alone. */
export async function writeDataset(client: pg.Client, data: Dataset): Promise<void> {
  await client.query("begin");
  try {
    const all = GENERATED_TABLES.map((t) => `ecosystem.${t}`).join(", ");
    await client.query(`truncate ${all}, eval._eval_tags restart identity`);
    for (const [name, columns, rows] of tables(data)) await insertRows(client, `ecosystem.${name}`, columns, rows);
    await insertRows(client, "eval._eval_tags", ["entity_type", "entity_id", "tag", "note"],
      data.evalTags.map((t) => [t.entity_type, t.entity_id, t.tag, t.note]));
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

function emptyDataset(): Dataset {
  return {
    team: [], leads: [], partners: [], people: [], onboardingSignals: [], accounts: [], opportunities: [],
    opportunityPartners: [], dealRegistrations: [], touches: [], invoices: [], credentials: [], examAttempts: [],
    tierHistory: [], accruals: [], packages: [], campaigns: [], programCosts: [], contributions: [], tickets: [],
    engagementEvents: [], programDocs: [], evalTags: [],
  };
}


// ---------------------------------------------------------------------------
// Summary: the Year-1 targets (decisions 65, 66, 90), so a preview shows at a
// glance whether the generator lands where the program said it would.

export function summarize({ data: d }: Generated): string {
  const out: string[] = ["", "Rows"];
  for (const [name, , rows] of tables(d)) out.push(`  ${name.padEnd(26)} ${rows.length.toLocaleString("en-US")}`);
  out.push(`  ${"_eval_tags".padEnd(26)} ${d.evalTags.length.toLocaleString("en-US")}`);

  const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "n/a");
  const activated = d.partners.filter((p) => p.first_live_customer_at !== null);
  const opps = new Map(d.opportunities.map((o) => [o.id, o]));
  const liveCustomers = new Set(d.opportunityPartners
    .filter((r) => LIVE_ROLES.has(r.role) && opps.get(r.opportunity_id)!.go_live_at !== null)
    .map((r) => opps.get(r.opportunity_id)!.account_id));
  const automated = d.partners.filter((p) => p.onboarding_plan === "automated");
  const touched = new Set(d.onboardingSignals.filter((s) => HUMAN_TOUCH.includes(s.intervention)).map((s) => s.partner_id));
  const weeks = (AS_OF - (WINDOW_START - 60 * DAY)) / (7 * DAY);

  out.push("", "Year-1 targets (target in brackets)",
    `  partners signed            ${d.partners.length}  (about 1,000)`,
    `  beta design partners       ${d.partners.filter((p) => p.beta).length}  (25)`,
    `  activated                  ${activated.length}  (about 250)`,
    `  customers live via partners ${liveCustomers.size}  (400)`,
    `  per team member            ${(liveCustomers.size / program.team.headcount).toFixed(1)}  (44+)`,
    `  managed partners           ${d.partners.filter((p) => p.partner_account_manager_id).length}  (60 to 80)`,
    `  leads a week               ${(d.leads.length / weeks).toFixed(0)}  (about 70)`,
    `  Hub answers, no ticket     ${pct(d.tickets.filter((t) => t.answered_by_hub).length, d.tickets.length)}  (60%)`,
    `  long tail, no human touch  ${pct(automated.filter((p) => !touched.has(p.id)).length, automated.length)}  (70%)`);

  out.push("", "Activated within 90 days, by signing cohort (exit rate climbs to 40%)");
  const cohorts = new Map<string, { n: number; early: number }>();
  for (const p of d.partners) {
    if (p.terms_accepted_at > AS_OF - 90 * DAY) continue;
    const key = p.beta ? `beta ${new Date(WINDOW_START).toISOString().slice(0, 7)}` : new Date(p.terms_accepted_at).toISOString().slice(0, 7);
    const c = cohorts.get(key) ?? { n: 0, early: 0 };
    c.n += 1;
    if (p.first_live_customer_at !== null && p.first_live_customer_at - p.terms_accepted_at <= 90 * DAY) c.early += 1;
    cohorts.set(key, c);
  }
  for (const [k, c] of [...cohorts].sort()) out.push(`  ${k.padEnd(13)} ${String(c.n).padStart(4)}  ${pct(c.early, c.n)}`);

  const tiers = new Map<string, number>();
  for (const p of d.partners) tiers.set(p.tier, (tiers.get(p.tier) ?? 0) + 1);
  out.push("", "Tiers", ...[...tiers].sort((a, b) => tierRank(a[0] as never) - tierRank(b[0] as never)).map(([t, n]) => `  ${t.padEnd(10)} ${n}`));
  const segs = new Map<string, number>();
  for (const p of d.partners) segs.set(p.segment, (segs.get(p.segment) ?? 0) + 1);
  out.push("", "Segments", ...[...segs].sort().map(([s, n]) => `  ${s.padEnd(10)} ${n}`));

  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const costBy = new Map<string, number>();
  for (const c of d.programCosts) costBy.set(c.category, (costBy.get(c.category) ?? 0) + c.amount);
  out.push("", "Program costs, Jan 2027 to Mar 2028", ...[...costBy].map(([k, v]) => `  ${k.padEnd(24)} ${money(v)}`));
  out.push(`  beta packages             ${money(d.packages.filter((p) => p.beta).reduce((s, p) => s + p.amount, 0))} of ${money(program.implementation_package.beta_budget)}`);
  out.push(`  packages, Year 1          ${d.packages.filter((p) => p.approved_at >= LAUNCH).length}`);

  const tags = new Map<string, number>();
  for (const t of d.evalTags) {
    const key = `${t.tag} (${t.note.split(":")[0]})`;
    tags.set(key, (tags.get(key) ?? 0) + 1);
  }
  out.push("", "Eval tags", ...[...tags].sort().map(([k, n]) => `  ${k.padEnd(48)} ${n}`));
  out.push("", `Seeded scenario targets: ${JSON.stringify(SEEDED)}`);
  return out.join("\n");
}
