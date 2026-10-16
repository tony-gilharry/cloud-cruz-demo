// Tiers follow counts (decision 33). On the 1st of every month the generator
// scores every partner with the same rules the tier agent will use, and
// promotes it to the highest tier it now qualifies for (decision 92).
// Seeded mismatches (edge-cases.ts) break this on purpose.
import { AS_OF, DAY, POINTS_FROM, WINDOW_START, addMonths, dateMs, id, program, tierRank } from "../config.ts";
import type { Contribution, Credential, Opportunity, OpportunityPartner, Partner, Tier, TierChange } from "../types.ts";
import { LIVE_ROLES } from "./milestones.ts";

/** Promotion checks: the 1st of each month after the beta starts. */
export const CHECKS: number[] = [];
for (let at = addMonths(WINDOW_START, 1); at <= AS_OF; at = addMonths(at, 1)) CHECKS.push(at);
export const ELITE_INVITATIONS = dateMs(program.reviews.elite_invitations);

/** What a partner has on a given date, in the terms of the tier table. */
export interface Scorecard {
  certifiedPeople: number;
  salesAccredited: number;
  technicalAccredited: number;
  level2Plus: number;
  level3: number;
  liveJointCustomers: number;
  publicReferences: number;
  sourcedRevenue: number;
  contributionPoints: number;
}

export interface TierInputs {
  credentials: Map<string, Credential[]>;
  credited: Map<string, Opportunity[]>;    // deals where the partner holds a live role
  sourced: Map<string, Opportunity[]>;
  contributions: Map<string, Contribution[]>;
}

export function tierInputs(
  credentials: Credential[], opportunities: Opportunity[], roster: OpportunityPartner[], contributions: Contribution[],
): TierInputs {
  const opps = new Map(opportunities.map((o) => [o.id, o]));
  const credited = new Map<string, Opportunity[]>();
  for (const r of roster) if (LIVE_ROLES.has(r.role)) push(credited, r.partner_id, opps.get(r.opportunity_id)!);
  const sourced = new Map<string, Opportunity[]>();
  for (const o of opportunities) if (o.sourcing_partner_id) push(sourced, o.sourcing_partner_id, o);
  const creds = new Map<string, Credential[]>();
  for (const c of credentials) push(creds, c.partner_id, c);
  const contrib = new Map<string, Contribution[]>();
  for (const c of contributions) push(contrib, c.partner_id, c);
  return { credentials: creds, credited, sourced, contributions: contrib };
}

/**
 * The scorecard on date `at`. A person counts with an active credential and
 * product use in the 90 days before `at` (decision 47). Points count for the
 * half-year before a review, once points are in force (decision 89).
 */
export function scorecard(partnerId: string, at: number, inputs: TierInputs): Scorecard {
  const useWindow = program.credentials.product_use_days * DAY;
  const active = (inputs.credentials.get(partnerId) ?? []).filter((c) =>
    c.issued_at <= at && (c.expires_at === null || c.expires_at > at) &&
    c.last_product_use_at !== null && c.last_product_use_at >= at - useWindow);
  const people = (pred: (c: Credential) => boolean) => new Set(active.filter(pred).map((c) => c.person_id)).size;

  const live = (inputs.credited.get(partnerId) ?? []).filter((o) => o.go_live_at !== null && o.go_live_at <= at);
  const liveAccounts = new Set(live.map((o) => o.account_id));
  const refAccounts = new Set(live.filter((o) => o.public_reference).map((o) => o.account_id));
  const sourcedRevenue = (inputs.sourced.get(partnerId) ?? [])
    .filter((o) => o.won && o.closed_at! <= at && o.closed_at! > at - 365 * DAY)
    .reduce((s, o) => s + o.amount, 0);
  const halfStart = at - 182 * DAY;
  const points = at <= POINTS_FROM ? 0 : (inputs.contributions.get(partnerId) ?? [])
    .filter((c) => c.status === "approved" && c.reviewed_at !== null && c.reviewed_at <= at && c.submitted_at >= Math.max(halfStart, POINTS_FROM))
    .reduce((s, c) => s + c.points, 0);

  return {
    certifiedPeople: people(() => true),
    salesAccredited: people((c) => c.step === "sales_accreditation"),
    technicalAccredited: people((c) => c.step === "technical_accreditation"),
    level2Plus: people((c) => c.step === "level_2" || c.step === "level_3"),
    level3: people((c) => c.step === "level_3"),
    liveJointCustomers: liveAccounts.size,
    publicReferences: refAccounts.size,
    sourcedRevenue,
    contributionPoints: points,
  };
}

/** The highest tier a scorecard earns. Points apply only once in force. */
export function earnedTier(card: Scorecard, at: number, invited: boolean): Tier {
  let earned: Tier = "Member";
  for (const rule of program.tiers) {
    const pointsOk = at <= POINTS_FROM || card.contributionPoints >= rule.contribution_points;
    const select = rule.name !== "Select" || (card.salesAccredited >= 2 && card.technicalAccredited >= 2);
    const ok = card.certifiedPeople >= rule.certified_people && card.level2Plus >= rule.level_2_plus &&
      card.level3 >= rule.level_3 && card.liveJointCustomers >= rule.live_joint_customers &&
      card.publicReferences >= rule.public_references && card.sourcedRevenue >= rule.sourced_revenue &&
      pointsOk && select && (!rule.invite_only || invited);
    if (ok) earned = rule.name;
  }
  return earned;
}

/**
 * Tier history: every partner signs as Member, then is promoted at the first
 * monthly check where it qualifies. Demotions happen only at the Jul 1
 * review with 90 days' notice (decision 109); the generator models none in
 * Year 1, since the first review comes three months after launch.
 * `neverPromoted` holds the under-tiered seeded cases.
 */
export function buildTierHistory(partners: Partner[], inputs: TierInputs, neverPromoted: Set<string>): Omit<TierChange, "id">[] {
  const rows: Omit<TierChange, "id">[] = [];
  inviteToElite(partners, inputs);
  for (const p of partners) {
    rows.push({ partner_id: p.id, tier: "Member", reason: "signed", changed_at: p.terms_accepted_at });
    let current: Tier = "Member";
    for (const check of CHECKS) {
      if (neverPromoted.has(p.id)) break;
      if (check < p.terms_accepted_at || (p.status === "alumni" && p.alumni_at! <= check)) continue;
      const earned = earnedTier(scorecard(p.id, check, inputs), check, p.elite_invited && check >= ELITE_INVITATIONS);
      if (tierRank(earned) <= tierRank(current)) continue;
      rows.push({ partner_id: p.id, tier: earned, reason: "promoted", changed_at: check });
      current = earned;
    }
    p.tier = current;
  }
  return rows;
}

/** Labels set by hand with no counts behind them (seeded over-tiered partners). */
export function addLabelOverrides(rows: Omit<TierChange, "id">[], partners: Partner[], overrides: Map<string, { tier: Tier; at: number }>): void {
  for (const p of partners) {
    const o = overrides.get(p.id);
    if (!o) continue;
    rows.push({ partner_id: p.id, tier: o.tier, reason: "label", changed_at: o.at });
    p.tier = o.tier;
  }
}

export function withTierIds(rows: Omit<TierChange, "id">[]): TierChange[] {
  return rows.sort((a, b) => a.changed_at - b.changed_at || a.partner_id.localeCompare(b.partner_id))
    .map((row, i) => ({ id: id("H", i + 1, 5), ...row }));
}

/** The label a partner held on a date, from its tier history. */
export function tierAt(history: TierChange[], at: number): Tier {
  let tier: Tier = "Member";
  for (const row of history) if (row.changed_at <= at) tier = row.tier;
  return tier;
}

/** The Jan 1 review invites the two strongest Anchors to work toward Elite (decision 32). */
function inviteToElite(partners: Partner[], inputs: TierInputs): void {
  const at = ELITE_INVITATIONS;
  const anchors = partners.filter((p) => p.segment === "anchor" && p.terms_accepted_at < at);
  anchors.sort((a, b) => scorecard(b.id, at, inputs).liveJointCustomers - scorecard(a.id, at, inputs).liveJointCustomers || a.id.localeCompare(b.id));
  for (const p of anchors.slice(0, 2)) p.elite_invited = true;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
