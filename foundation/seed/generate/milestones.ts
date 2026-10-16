// Activation milestones, activation rating and the inactivity path, computed
// from the finished deals so they always agree with them (decisions 43, 56).
import { AS_OF, DAY, program } from "../config.ts";
import type { DealRegistration, Health, Opportunity, OpportunityPartner, Partner, Touch } from "../types.ts";

/** Roles that make a customer a joint customer: sourced, partner of record, implementer (decision 57). */
export const LIVE_ROLES = new Set(["sourced", "partner_of_record", "implementer"]);

export interface Milestones {
  firstDealReg: Map<string, number>;
  firstClosedWon: Map<string, number>;
  firstLive: Map<string, number>;
  lastActivity: Map<string, number>;
}

export function computeMilestones(
  partners: Partner[], opportunities: Opportunity[], roster: OpportunityPartner[],
  registrations: DealRegistration[], touches: Touch[],
): Milestones {
  const m: Milestones = { firstDealReg: new Map(), firstClosedWon: new Map(), firstLive: new Map(), lastActivity: new Map() };
  const earliest = (map: Map<string, number>, key: string, at: number) => {
    if (at < (map.get(key) ?? Infinity)) map.set(key, at);
  };
  const latest = (key: string, at: number) => {
    if (at <= AS_OF && at > (m.lastActivity.get(key) ?? 0)) m.lastActivity.set(key, at);
  };
  const opps = new Map(opportunities.map((o) => [o.id, o]));

  for (const r of registrations) {
    earliest(m.firstDealReg, r.partner_id, r.submitted_at);
    latest(r.partner_id, r.submitted_at);
  }
  for (const role of roster) {
    if (!LIVE_ROLES.has(role.role)) continue;
    const o = opps.get(role.opportunity_id)!;
    if (o.won) earliest(m.firstClosedWon, role.partner_id, o.closed_at!);
    if (o.go_live_at !== null && o.go_live_at <= AS_OF) earliest(m.firstLive, role.partner_id, o.go_live_at);
    latest(role.partner_id, o.created_at);
    if (o.closed_at !== null) latest(role.partner_id, o.closed_at);
  }
  for (const t of touches) latest(t.partner_id, t.touched_at);

  for (const p of partners) {
    p.first_deal_registration_at = m.firstDealReg.get(p.id) ?? null;
    p.first_closed_won_at = m.firstClosedWon.get(p.id) ?? null;
    p.first_live_customer_at = m.firstLive.get(p.id) ?? null;
    p.activation_rating = activationRating(p);
    // Inactivity path: a year with no customer activity moves a partner to
    // the alumni list. Earned commissions are always paid (decision 56).
    const last = Math.max(p.terms_accepted_at, m.lastActivity.get(p.id) ?? 0);
    const alumniAt = last + program.inactivity.alumni_days * DAY;
    if (alumniAt <= AS_OF) {
      p.status = "alumni";
      p.alumni_at = alumniAt;
    }
  }
  return m;
}

/** Speed through the milestones, summarized (decision 43). */
function activationRating(p: Partner): Health {
  if (p.first_live_customer_at !== null) {
    const days = (p.first_live_customer_at - p.terms_accepted_at) / DAY;
    return days <= 60 ? "hot" : days <= 150 ? "warm" : "cold";
  }
  if (p.first_deal_registration_at !== null && p.first_deal_registration_at - p.terms_accepted_at <= 30 * DAY) return "warm";
  return "cold";
}
