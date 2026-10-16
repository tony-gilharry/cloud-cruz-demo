// Money: the commission ledger, SPIFFs, implementation packages, the
// co-marketing fund, exam vouchers and monthly program costs. The cost lines
// are sums of the rows here, so ROI math in build 2 reconciles exactly.
import { AS_OF, DAY, LAUNCH, SPIFFS_FROM, WINDOW_START, addMonths, id, monthStart, program, startOfDay, tierRule } from "../config.ts";
import type { Rng } from "../rng.ts";
import type {
  CoMarketingCampaign, CommissionAccrual, Credential, ExamAttempt, ImplementationPackage, Invoice, Opportunity,
  OpportunityPartner, Partner, PartnerRole, ProgramCost, TierChange,
} from "../types.ts";
import { LIVE_ROLES } from "./milestones.ts";
import { tierAt } from "./tiers.ts";

const PACKAGE_UPTAKE = 0.85;
const HEADCOUNT_MONTHLY_COST = 16_250; // fully loaded, per person
const TOOLS_MONTHLY = 9_800;           // Salesforce, introw, Tipalti, Crossbeam, Zendesk, Slack, Credly
const TOOLS_ANNUAL_RENEWALS = 24_000;  // booked at launch

type Draft<T> = Omit<T, "id">;

// ---------------------------------------------------------------------------
// The commission ledger (decisions 21, 24, 25, 72 to 75, 85)

/** The next payout run on or after a date (the 15th of each month). */
export function payoutRun(at: number): number {
  const d = new Date(at);
  const day = program.commissions.payout_day_of_month;
  const thisMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day);
  return thisMonth >= startOfDay(at) ? thisMonth : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day);
}

/** Status on the as-of date: held during the hold, earned until the payout run, then released. */
function settle(row: Draft<CommissionAccrual>): void {
  const run = payoutRun(row.hold_until);
  if (run <= AS_OF) {
    row.status = "released";
    row.released_at = run;
  } else {
    row.status = row.hold_until <= AS_OF ? "earned" : "held";
  }
}

export function generateAccruals(
  opportunities: Opportunity[], roster: OpportunityPartner[], invoices: Invoice[], history: Map<string, TierChange[]>,
): Draft<CommissionAccrual>[] {
  const c = program.commissions;
  const opps = new Map(opportunities.map((o) => [o.id, o]));
  const paying = new Map<string, OpportunityPartner[]>();
  for (const r of roster) if (c.paying_roles.includes(r.role)) paying.set(r.opportunity_id, [...(paying.get(r.opportunity_id) ?? []), r]);

  const rows: Draft<CommissionAccrual>[] = [];
  for (const inv of invoices) {
    if (inv.paid_at === null) continue;
    const opp = opps.get(inv.opportunity_id)!;
    for (const r of paying.get(opp.id) ?? []) {
      // The tier rate pays for 24 months from go-live (decision 73); no Year-1 deal gets there.
      if (opp.go_live_at !== null && inv.period_start > addMonths(opp.go_live_at, c.term_months)) continue;
      // The rate at close holds for the deal's whole term (decision 73).
      const rate = r.role === "partner_of_record"
        ? c.marketplace_partner_of_record_rate
        : tierRule(tierAt(history.get(r.partner_id) ?? [], opp.closed_at!)).commission_rate;
      const row: Draft<CommissionAccrual> = {
        partner_id: r.partner_id, opportunity_id: opp.id, role: r.role, invoice_id: inv.id,
        mechanism: opp.pricing_plan === "self_serve" ? "per_invoice" : "annualized", spiff_trigger: null, rate,
        amount: Math.round(inv.amount * rate * 100) / 100, status: "held", earned_at: inv.paid_at,
        hold_until: inv.paid_at + c.hold_days * DAY, released_at: null, reversed_at: null,
      };
      // A refund inside 90 days reverses the commission, even after release (decision 75).
      if (inv.refunded_at !== null && inv.refunded_at - inv.paid_at <= c.clawback_days * DAY) {
        settle(row);
        row.status = "reversed";
        row.released_at = null;
        row.reversed_at = inv.refunded_at;
      } else {
        settle(row);
      }
      rows.push(row);
    }
  }
  return rows;
}

/** SPIFFs fire on the north star, from the Jul 1, 2027 review (decisions 76, 88). */
export function generateSpiffs(
  partners: Partner[], opportunities: Opportunity[], roster: OpportunityPartner[], invoices: Invoice[],
): Draft<CommissionAccrual>[] {
  const s = program.commissions.spiffs;
  const opps = new Map(opportunities.map((o) => [o.id, o]));
  const lastInvoice = new Map<string, number>();
  for (const inv of invoices) lastInvoice.set(inv.opportunity_id, Math.max(lastInvoice.get(inv.opportunity_id) ?? 0, inv.issued_at));
  const credited = new Map<string, { opp: Opportunity; role: PartnerRole }[]>();
  for (const r of roster) {
    const o = opps.get(r.opportunity_id)!;
    if (LIVE_ROLES.has(r.role) && o.go_live_at !== null && o.go_live_at <= AS_OF) {
      credited.set(r.partner_id, [...(credited.get(r.partner_id) ?? []), { opp: o, role: r.role }]);
    }
  }

  const rows: Draft<CommissionAccrual>[] = [];
  const spiff = (p: Partner, opp: Opportunity, role: PartnerRole, trigger: CommissionAccrual["spiff_trigger"], amount: number, at: number) => {
    if (at < SPIFFS_FROM || at > AS_OF) return;
    const row: Draft<CommissionAccrual> = {
      partner_id: p.id, opportunity_id: opp.id, role, invoice_id: null, mechanism: "spiff", spiff_trigger: trigger,
      rate: null, amount, status: "held", earned_at: at, hold_until: at + program.commissions.hold_days * DAY,
      released_at: null, reversed_at: null,
    };
    settle(row);
    rows.push(row);
  };

  for (const p of partners) {
    const lives = (credited.get(p.id) ?? []).sort((a, b) => a.opp.go_live_at! - b.opp.go_live_at! || a.opp.id.localeCompare(b.opp.id));
    if (lives.length === 0) continue;
    spiff(p, lives[0].opp, lives[0].role, "first_customer_live", s.first_customer_live, lives[0].opp.go_live_at!);
    const firstEnterprise = lives.find((l) => l.opp.pricing_plan === "enterprise");
    if (firstEnterprise) spiff(p, firstEnterprise.opp, firstEnterprise.role, "first_enterprise_live", s.first_enterprise_live, firstEnterprise.opp.go_live_at!);
    for (const l of lives) {
      const anniversary = addMonths(l.opp.go_live_at!, 12);
      // Retained means still billing at the one-year mark.
      if (anniversary <= AS_OF && (lastInvoice.get(l.opp.id) ?? 0) >= anniversary - 95 * DAY) {
        spiff(p, l.opp, l.role, "retained_12_months", s.retained_12_months, anniversary);
      }
    }
  }
  return rows;
}

export function withAccrualIds(rows: Draft<CommissionAccrual>[]): CommissionAccrual[] {
  // Ids are assigned in place so seeded rows, held by reference, still match.
  return rows.sort((a, b) => a.earned_at - b.earned_at || a.partner_id.localeCompare(b.partner_id) || a.opportunity_id.localeCompare(b.opportunity_id))
    .map((row, i) => Object.assign(row, { id: id("CA", i + 1, 5) }));
}

// ---------------------------------------------------------------------------
// Implementation packages (decisions 45, 53, 61)

export function generatePackages(
  rng: Rng, opportunities: Opportunity[], roster: OpportunityPartner[], credentials: Credential[],
): Draft<ImplementationPackage>[] {
  const ip = program.implementation_package;
  const opps = new Map(opportunities.map((o) => [o.id, o]));
  const l2 = new Map<string, Credential[]>();
  for (const c of credentials) {
    if ((c.step === "level_2" || c.step === "level_3") && c.track === "technical") l2.set(c.partner_id, [...(l2.get(c.partner_id) ?? []), c]);
  }
  const rows: Draft<ImplementationPackage>[] = [];
  let betaSpent = 0;
  for (const r of roster) {
    if (!ip.eligible_roles.includes(r.role)) continue;
    const opp = opps.get(r.opportunity_id)!;
    if (opp.pricing_plan !== "enterprise" || opp.amount < ip.bands[0].min_acv) continue;
    // Approved mid-deal for a sourcing partner; at close for an implementer or influencer.
    const approved = startOfDay(r.role === "sourced"
      ? opp.created_at + rng.between(0.2, 0.6) * ((opp.closed_at ?? AS_OF) - opp.created_at)
      : opp.closed_at ?? AS_OF);
    if (approved > AS_OF || (r.role !== "sourced" && !opp.won)) continue;
    const person = (l2.get(r.partner_id) ?? []).find((c) => c.issued_at <= approved && c.expires_at! > approved);
    // In the beta no partner can hold Level 2 yet, so the PSA stands in (decision 91).
    const psa = !person && approved < LAUNCH && ip.beta_psa_stands_in;
    if ((!person && !psa) || !rng.chance(PACKAGE_UPTAKE)) continue;
    const pkg = packageFor(opp, r.partner_id, person?.id ?? null, approved, psa);
    if (pkg.beta) {
      if (betaSpent + pkg.amount > ip.beta_budget) continue;
      betaSpent += pkg.amount;
    }
    pkg.paid_at = opp.go_live_at !== null && opp.go_live_at + 15 * DAY <= AS_OF ? opp.go_live_at + rng.int(0, 15) * DAY : null;
    rows.push(pkg);
  }
  return rows;
}

export function packageFor(
  opp: Opportunity, partnerId: string, credentialId: string | null, approved: number, psaStandIn = false,
): Draft<ImplementationPackage> {
  const ip = program.implementation_package;
  const band = [...ip.bands].reverse().find((b) => opp.amount >= b.min_acv)!;
  return {
    opportunity_id: opp.id, partner_id: partnerId, credential_id: credentialId, band: band.band,
    consulting_hours: band.consulting_hours, technical_hours: band.technical_hours,
    consulting_rate: ip.consulting_rate, technical_rate: ip.technical_rate,
    amount: band.consulting_hours * ip.consulting_rate + band.technical_hours * ip.technical_rate,
    beta: approved < LAUNCH, psa_stand_in: psaStandIn, approved_at: approved, paid_at: null,
  };
}

export function withPackageIds(rows: Draft<ImplementationPackage>[]): ImplementationPackage[] {
  return rows.sort((a, b) => a.approved_at - b.approved_at || a.opportunity_id.localeCompare(b.opportunity_id))
    .map((row, i) => ({ id: id("IP", i + 1, 4), ...row }));
}

// ---------------------------------------------------------------------------
// Co-marketing fund (decision 77)

export function generateCampaigns(rng: Rng, partners: Partner[], history: Map<string, TierChange[]>): CoMarketingCampaign[] {
  const eligible = new Set(program.co_marketing.tiers);
  const rows: Draft<CoMarketingCampaign>[] = [];
  for (const p of partners) {
    // From the day the partner first held an eligible label.
    const from = (history.get(p.id) ?? []).find((h) => eligible.has(h.tier))?.changed_at;
    if (from === undefined) continue;
    const halves = Math.max(0.5, (AS_OF - from) / (182 * DAY));
    for (let n = rng.poisson(1.5 * halves); n > 0; n -= 1) {
      const submitted = startOfDay(rng.between(from, AS_OF - 3 * DAY));
      const reviewed = submitted + rng.int(2, 10) * DAY;
      const approved = reviewed <= AS_OF && rng.chance(0.85);
      const proof = approved ? reviewed + rng.int(30, 60) * DAY : null;
      const paid = proof !== null ? proof + rng.int(5, 20) * DAY : null;
      rows.push({
        partner_id: p.id, size: rng.pick(program.co_marketing.campaign_sizes), submitted_at: submitted,
        status: reviewed > AS_OF ? "submitted" : !approved ? "rejected" : paid !== null && paid <= AS_OF ? "paid" : "approved",
        approved_at: approved ? reviewed : null,
        proof_at: proof !== null && proof <= AS_OF ? proof : null,
        paid_at: paid !== null && paid <= AS_OF ? paid : null,
      });
    }
  }
  return rows.sort((a, b) => a.submitted_at - b.submitted_at || a.partner_id.localeCompare(b.partner_id))
    .map((row, i) => ({ id: id("CM", i + 1, 4), ...row }));
}

// ---------------------------------------------------------------------------
// Exam vouchers (decisions 81, 83)

/**
 * Settles who paid for each exam. Each program year (Apr 1) a partner gets
 * its tier's free exams; Anchors get extra; people on an accelerated plan get
 * one more each. When the pool runs out, the partner pays the fee.
 */
export function settleExamPayments(attempts: ExamAttempt[], partners: Partner[], history: Map<string, TierChange[]>): void {
  const e = program.exams;
  const byId = new Map(partners.map((p) => [p.id, p]));
  const used = new Map<string, { tier: number; anchor: number }>();
  const acceleratedUsed = new Set<string>();
  for (const a of attempts) {
    const p = byId.get(a.partner_id)!;
    const year = a.attempted_at >= LAUNCH ? 1 : 0;
    const key = `${p.id}|${year}`;
    const pool = used.get(key) ?? { tier: 0, anchor: 0 };
    used.set(key, pool);
    const tierAllowance = tierRule(tierAt(history.get(p.id) ?? [], a.attempted_at)).free_exams_per_year;
    if (p.onboarding_plan === "accelerated" && !acceleratedUsed.has(a.person_id) && e.accelerated_plan_extra_per_person > 0) {
      acceleratedUsed.add(a.person_id);
      voucher(a, "accelerated_plan");
    } else if (pool.tier < tierAllowance) {
      pool.tier += 1;
      voucher(a, "tier");
    } else if (p.segment === "anchor" && pool.anchor < e.anchor_extra_per_year) {
      pool.anchor += 1;
      voucher(a, "anchor");
    }
  }
}

function voucher(a: ExamAttempt, source: NonNullable<ExamAttempt["voucher_source"]>): void {
  a.paid_by = "voucher";
  a.voucher_source = source;
}

// ---------------------------------------------------------------------------
// Monthly program costs

export function generateProgramCosts(
  accruals: CommissionAccrual[], packages: ImplementationPackage[], campaigns: CoMarketingCampaign[], attempts: ExamAttempt[],
): ProgramCost[] {
  const costs: ProgramCost[] = [];
  const inMonth = (at: number | null, start: number, end: number) => at !== null && at >= start && at < end;
  for (let start = WINDOW_START; start <= AS_OF; start = addMonths(start, 1)) {
    const end = addMonths(start, 1);
    const sum = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;
    const add = (category: ProgramCost["category"], amount: number) => costs.push({ period: monthStart(start), category, amount });
    add("headcount", program.team.headcount * HEADCOUNT_MONTHLY_COST); // flat at 9 (decision 66)
    // Commissions are a cost when earned; reversed ones never were.
    add("commissions", sum(accruals.filter((a) => a.status !== "reversed" && inMonth(a.earned_at, start, end)).map((a) => a.amount)));
    add("implementation_packages", sum(packages.filter((p) => inMonth(p.paid_at, start, end)).map((p) => p.amount)));
    add("co_marketing", sum(campaigns.filter((c) => inMonth(c.paid_at, start, end)).map((c) => c.size)));
    add("exam_vouchers", sum(attempts.filter((a) => a.paid_by === "voucher" && inMonth(a.attempted_at, start, end)).map((a) => a.fee)));
    add("tools", TOOLS_MONTHLY + (start === LAUNCH ? TOOLS_ANNUAL_RENEWALS : 0));
  }
  return costs;
}
