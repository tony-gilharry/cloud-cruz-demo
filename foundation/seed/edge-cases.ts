// Seeded scenarios and the evaluation labels that record them.
//
// Seeding happens during generation. Tagging happens at the end and is
// computed from the finished data using the same definitions the demos use,
// so the evaluation labels are ground truth: it catches every case, seeded or one
// that arose naturally from the randomness. Each tag's note says which.
import { AS_OF, DAY, POINTS_FROM, attribution, tierRank } from "./config.ts";
import { HOUR, registration, responseHours, sample } from "./generate/pipeline.ts";
import { HUMAN_TOUCH, type Pace } from "./generate/onboarding.ts";
import { LIVE_ROLES } from "./generate/milestones.ts";
import { packageFor } from "./generate/money.ts";
import { CHECKS, ELITE_INVITATIONS, earnedTier, scorecard, type TierInputs } from "./generate/tiers.ts";
import type { Rng } from "./rng.ts";
import type {
  CommissionAccrual, Dataset, DealRegistration, EvalTag, ImplementationPackage, Opportunity, Partner, Tier,
} from "./types.ts";

export const SEEDED = {
  stale: 40, duplicates: 25, conflicts: 25, overTiered: 10, underTiered: 4,
  ignoredStalls: 15, packagesWithoutL2: 5, earlyReleases: 8, twoPartnerDeals: 30,
};

/** Objects seeded on purpose, so tag notes can say "seeded" or "natural". */
export interface Seeded {
  partners: Set<string>;
  registrations: Set<DealRegistration>;
  packages: Set<Omit<ImplementationPackage, "id">>;
  accruals: Set<Omit<CommissionAccrual, "id">>;
  opportunities: Set<Opportunity>;
}

export const emptySeeded = (): Seeded => ({
  partners: new Set(), registrations: new Set(), packages: new Set(), accruals: new Set(), opportunities: new Set(),
});

// ---------------------------------------------------------------------------
// Seeding

/**
 * Stale partners: activated, active on paper, but they stopped selling 100
 * to 240 days ago. Half still log in, which should not fool the
 * active-partner rule. Runs before any deals exist.
 */
export function planStalePartners(rng: Rng, partners: Partner[], seeded: Seeded): void {
  const candidates = partners.filter((p) => p.planned_live_at !== null && p.planned_live_at < AS_OF - 150 * DAY && p.weight >= 2);
  for (const p of sample(rng, candidates, SEEDED.stale)) {
    p.activeUntil = Math.max(p.planned_live_at! + 15 * DAY, AS_OF - rng.between(100, 240) * DAY);
    p.keepsEngaging = rng.chance(0.5);
    seeded.partners.add(p.id);
  }
}

/** Partners who go cold in onboarding and nobody acts (the miss decision 46 exists to prevent). */
export function planIgnoredStalls(rng: Rng, partners: Partner[], paces: Map<string, Pace>, seeded: Seeded): Set<string> {
  const candidates = partners.filter((p) => p.onboarding_plan === "automated" && paces.get(p.id)!.completionDay === null &&
    p.terms_accepted_at < AS_OF - 40 * DAY && !seeded.partners.has(p.id));
  const ignored = new Set(sample(rng, candidates, SEEDED.ignoredStalls).map((p) => p.id));
  for (const pid of ignored) seeded.partners.add(pid);
  return ignored;
}

/** Two partners register the same account and product within 30 days. */
export function seedDuplicateRegistrations(rng: Rng, regs: DealRegistration[], partners: Partner[], seeded: Seeded): void {
  const originals = regs.filter((r) => r.status !== "pending" && r.submitted_at < AS_OF - 35 * DAY);
  for (const original of sample(rng, originals, SEEDED.duplicates)) {
    const at = original.submitted_at + rng.between(1, 25) * DAY;
    const other = partnerAt(rng, partners, at, original.partner_id);
    if (!other) continue;
    // Half were caught and rejected; half slipped through and were approved.
    const caught = rng.chance(0.5);
    const dup = registration(rng, {
      partner_id: other.id, account_id: original.account_id, opportunity_id: null, submitted_at: at,
      amount: original.amount, product: original.product,
      status: caught ? "rejected" : "approved", reason: caught ? "duplicate_registration" : null,
      responded_at: at + responseHours(rng) * HOUR,
    });
    regs.push(dup);
    seeded.registrations.add(dup);
  }
}

/** A partner registers an account while a direct opportunity is already open on it. */
export function seedDirectConflicts(
  rng: Rng, regs: DealRegistration[], opportunities: Opportunity[], partners: Partner[], seeded: Seeded,
): void {
  const direct = opportunities.filter((o) => o.source === "direct" && (o.closed_at ?? AS_OF) - o.created_at > 20 * DAY && o.created_at > partners[0].terms_accepted_at);
  for (const opp of sample(rng, direct, SEEDED.conflicts)) {
    const at = rng.between(opp.created_at + 5 * DAY, Math.min(opp.closed_at ?? AS_OF, AS_OF - 3 * DAY));
    const partner = partnerAt(rng, partners, at, null);
    if (!partner) continue;
    const caught = rng.chance(0.5);
    const reg = registration(rng, {
      partner_id: partner.id, account_id: opp.account_id, opportunity_id: null, submitted_at: at,
      amount: Math.round(opp.amount / 100) * 100,
      status: caught ? "rejected" : "approved", reason: caught ? "existing_direct_opportunity" : null,
      responded_at: at + responseHours(rng) * HOUR,
    });
    regs.push(reg);
    seeded.registrations.add(reg);
  }
}

/**
 * Tier labels that do not match counts. Over-tiered partners hold a Select
 * or Premier label set by hand with Member-level results. Under-tiered
 * partners qualified more than 30 days ago but were never promoted.
 */
export function planTierMismatches(
  rng: Rng, partners: Partner[], inputs: TierInputs, seeded: Seeded,
): { overrides: Map<string, { tier: Tier; at: number }>; neverPromoted: Set<string> } {
  const overdue = CHECKS.filter((c) => c <= AS_OF - 30 * DAY);
  const eligible = partners.filter((p) => p.status === "active" && !seeded.partners.has(p.id));
  const qualifiers = eligible.filter((p) => overdue.some((c) => c >= p.terms_accepted_at &&
    tierRank(earnedTier(scorecard(p.id, c, inputs), c, false)) > 0));
  const quiet = eligible.filter((p) => p.terms_accepted_at < POINTS_FROM && p.planned_live_at === null && p.first_deal_registration_at !== null);

  const neverPromoted = new Set(sample(rng, qualifiers, SEEDED.underTiered).map((p) => p.id));
  const overrides = new Map<string, { tier: Tier; at: number }>();
  sample(rng, quiet.filter((p) => !neverPromoted.has(p.id)), SEEDED.overTiered).forEach((p, i) => {
    const at = Math.floor(rng.between(POINTS_FROM + 14 * DAY, AS_OF - 30 * DAY) / DAY) * DAY;
    overrides.set(p.id, { tier: i < 4 ? "Premier" : "Select", at });
  });
  for (const pid of [...neverPromoted, ...overrides.keys()]) seeded.partners.add(pid);
  return { overrides, neverPromoted };
}

/** Packages drawn with no Level 2 technical person on the deal (decision 53 says impossible). */
export function seedPackagesWithoutL2(
  rng: Rng, packages: Omit<ImplementationPackage, "id">[], opportunities: Opportunity[], seeded: Seeded,
): void {
  const taken = new Set(packages.map((p) => p.opportunity_id));
  const candidates = opportunities.filter((o) => o.source === "partner_sourced" && o.pricing_plan === "enterprise" &&
    o.amount >= 50_000 && !taken.has(o.id) && o.created_at > AS_OF - 300 * DAY);
  for (const opp of sample(rng, candidates, SEEDED.packagesWithoutL2)) {
    const approved = Math.floor((opp.created_at + 10 * DAY) / DAY) * DAY;
    if (approved > AS_OF) continue;
    const pkg = packageFor(opp, opp.sourcing_partner_id!, null, approved);
    packages.push(pkg);
    seeded.packages.add(pkg);
  }
}

/** Commissions released before the 60-day hold ended: a payout error triage must catch. */
export function seedEarlyReleases(rng: Rng, accruals: Omit<CommissionAccrual, "id">[], seeded: Seeded): void {
  const held = accruals.filter((a) => a.status === "held" && a.mechanism !== "spiff" && a.earned_at < AS_OF - 10 * DAY);
  for (const a of sample(rng, held, SEEDED.earlyReleases)) {
    a.status = "released";
    a.released_at = Math.floor((a.earned_at + rng.between(7, 30) * DAY) / DAY) * DAY;
    if (a.released_at > AS_OF) a.released_at = Math.floor(AS_OF / DAY) * DAY;
    seeded.accruals.add(a);
  }
}

// ---------------------------------------------------------------------------
// Evaluation labels

export function computeEvalTags(data: Dataset, seeded: Seeded, inputs: TierInputs): EvalTag[] {
  return [
    ...duplicateTags(data, seeded),
    ...conflictTags(data, seeded),
    ...staleTags(data, seeded),
    ...tierMismatchTags(data, seeded, inputs),
    ...expiredCredentialTags(data),
    ...stallTags(data, seeded),
    ...packageTags(data, seeded),
    ...earlyReleaseTags(data, seeded),
    ...multiPartnerTags(data, seeded),
  ];
}

const origin = (isSeeded: boolean) => (isSeeded ? "seeded" : "natural");
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function duplicateTags(data: Dataset, seeded: Seeded): EvalTag[] {
  const tags: EvalTag[] = [];
  for (const group of groupBy(data.dealRegistrations, (r) => `${r.account_id}|${r.product}`).values()) {
    group.sort((a, b) => a.submitted_at - b.submitted_at);
    for (let i = 1; i < group.length; i += 1) {
      const later = group[i];
      const earlier = group.slice(0, i).find((r) => r.partner_id !== later.partner_id && later.submitted_at - r.submitted_at <= 30 * DAY);
      if (!earlier) continue;
      tags.push({ entity_type: "deal_registration", entity_id: later.id, tag: "duplicate_deal_reg",
        note: `${origin(seeded.registrations.has(later))}: same account and product as ${earlier.id} within 30 days` });
    }
  }
  return tags;
}

function conflictTags(data: Dataset, seeded: Seeded): EvalTag[] {
  const directByAccount = groupBy(data.opportunities.filter((o) => o.source === "direct"), (o) => o.account_id);
  const tags: EvalTag[] = [];
  for (const reg of data.dealRegistrations) {
    if (reg.opportunity_id !== null) continue;
    const open = (directByAccount.get(reg.account_id) ?? []).find((o) => o.created_at <= reg.submitted_at && reg.submitted_at <= (o.closed_at ?? AS_OF));
    if (!open) continue;
    tags.push({ entity_type: "deal_registration", entity_id: reg.id, tag: "direct_partner_conflict",
      note: `${origin(seeded.registrations.has(reg))}: direct opportunity ${open.id} was open when this was submitted` });
  }
  return tags;
}

/** Last time each partner sold, influenced or supported (attribution.yaml). */
export function lastCustomerActivity(data: Dataset): Map<string, number> {
  const last = new Map<string, number>();
  const bump = (partnerId: string, at: number | null) => {
    if (at === null || at > AS_OF) return;
    if (at > (last.get(partnerId) ?? 0)) last.set(partnerId, at);
  };
  const opps = new Map(data.opportunities.map((o) => [o.id, o]));
  for (const r of data.opportunityPartners) {
    if (r.role === "influenced") continue;
    const o = opps.get(r.opportunity_id)!;
    bump(r.partner_id, o.created_at);
    bump(r.partner_id, o.closed_at);
  }
  for (const t of data.touches) bump(t.partner_id, t.touched_at);
  return last;
}

function staleTags(data: Dataset, seeded: Seeded): EvalTag[] {
  const cutoff = AS_OF - attribution.active_partner.window_days * DAY;
  const last = lastCustomerActivity(data);
  return data.partners
    .filter((p) => p.status === "active" && last.has(p.id) && last.get(p.id)! < cutoff)
    .map((p) => ({ entity_type: "partner", entity_id: p.id, tag: "stale_partner",
      note: `${origin(seeded.partners.has(p.id))}: last customer activity ${ymd(last.get(p.id)!)}` + (p.keepsEngaging ? ", still logging in" : "") }));
}

/** The label each partner should hold if every monthly check had been applied. */
function tierMismatchTags(data: Dataset, seeded: Seeded, inputs: TierInputs): EvalTag[] {
  const tags: EvalTag[] = [];
  for (const p of data.partners) {
    let expected: Tier = "Member";
    for (const check of CHECKS) {
      if (check < p.terms_accepted_at || (p.alumni_at !== null && p.alumni_at <= check)) continue;
      const earned = earnedTier(scorecard(p.id, check, inputs), check, p.elite_invited && check >= ELITE_INVITATIONS);
      if (tierRank(earned) > tierRank(expected)) expected = earned;
    }
    if (expected === p.tier) continue;
    const direction = tierRank(p.tier) > tierRank(expected) ? "over-tiered" : "under-tiered";
    tags.push({ entity_type: "partner", entity_id: p.id, tag: "tier_mismatch",
      note: `${origin(seeded.partners.has(p.id))}: label ${p.tier}, counts earn ${expected} (${direction})` });
  }
  return tags;
}

/** A Level credential at an active partner expired with no renewal (natural: Levels last 12 months). */
function expiredCredentialTags(data: Dataset): EvalTag[] {
  const status = new Map(data.partners.map((p) => [p.id, p.status]));
  const renewed = new Set(data.credentials.filter((c) => c.expires_at !== null && c.expires_at > AS_OF)
    .map((c) => `${c.person_id}|${c.step}|${c.track}`));
  return data.credentials
    .filter((c) => c.expires_at !== null && c.expires_at < AS_OF && status.get(c.partner_id) === "active" &&
      !renewed.has(`${c.person_id}|${c.step}|${c.track}`))
    .map((c) => ({ entity_type: "credential", entity_id: c.id, tag: "expired_credential",
      note: `natural: ${c.step} (${c.track}) expired ${ymd(c.expires_at!)} with no renewal` }));
}

/** Cold for three or more days in onboarding with no person ever acting. */
function stallTags(data: Dataset, seeded: Seeded): EvalTag[] {
  const tags: EvalTag[] = [];
  for (const [partnerId, rows] of groupBy(data.onboardingSignals, (s) => s.partner_id)) {
    const cold = rows.filter((r) => r.health === "cold").length;
    const touched = rows.some((r) => HUMAN_TOUCH.includes(r.intervention));
    if (cold >= 3 && !touched) {
      tags.push({ entity_type: "partner", entity_id: partnerId, tag: "stalled_onboarding_no_intervention",
        note: `${origin(seeded.partners.has(partnerId))}: cold for ${cold} days with no outreach` });
    }
  }
  return tags;
}

function packageTags(data: Dataset, seeded: Seeded): EvalTag[] {
  const creds = new Map(data.credentials.map((c) => [c.id, c]));
  return data.packages.filter((pkg) => {
    if (pkg.psa_stand_in) return false; // the beta exception (decision 91)
    const c = pkg.credential_id ? creds.get(pkg.credential_id) : undefined;
    return !c || c.track !== "technical" || (c.step !== "level_2" && c.step !== "level_3") ||
      c.issued_at > pkg.approved_at || (c.expires_at !== null && c.expires_at <= pkg.approved_at);
  }).map((pkg) => ({ entity_type: "implementation_package", entity_id: pkg.id, tag: "package_without_level_2",
    note: `${origin([...seeded.packages].some((x) => x.opportunity_id === pkg.opportunity_id && x.credential_id === null))}: ` +
      `no active Level 2 technical credential on ${pkg.opportunity_id}` }));
}

function earlyReleaseTags(data: Dataset, seeded: Seeded): EvalTag[] {
  return data.accruals.filter((a) => a.released_at !== null && a.released_at < a.hold_until)
    .map((a) => ({ entity_type: "commission_accrual", entity_id: a.id, tag: "commission_released_early",
      note: `${origin(seeded.accruals.has(a))}: released ${ymd(a.released_at!)}, hold ran to ${ymd(a.hold_until)}` }));
}

/** Deals with more than one partner in a credited role: who gets credit, commission and the package? */
function multiPartnerTags(data: Dataset, seeded: Seeded): EvalTag[] {
  const seededIds = new Set([...seeded.opportunities].map((o) => o.id));
  const tags: EvalTag[] = [];
  for (const [oppId, roles] of groupBy(data.opportunityPartners, (r) => r.opportunity_id)) {
    const credited = roles.filter((r) => LIVE_ROLES.has(r.role));
    if (new Set(credited.map((r) => r.partner_id)).size < 2) continue;
    tags.push({ entity_type: "opportunity", entity_id: oppId, tag: "multi_partner_deal",
      note: `${origin(seededIds.has(oppId))}: ${credited.map((r) => `${r.partner_id} ${r.role}`).join(", ")}` });
  }
  return tags;
}

// ---------------------------------------------------------------------------

function partnerAt(rng: Rng, partners: Partner[], at: number, notId: string | null): Partner | null {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const p = rng.pick(partners);
    if (p.id !== notId && p.terms_accepted_at <= at && at <= p.activeUntil) return p;
  }
  return null;
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
