// Community and support: contribution points, partner questions and tickets,
// and the engagement trail that never counts as activity
// (decisions 17 to 19, 46, 66, 78, 82, 89).
import { AS_OF, DAY, POINTS_FROM, addBusinessDays, id, program } from "../config.ts";
import type { Rng } from "../rng.ts";
import type { Contribution, EngagementEvent, Partner, Person, SupportTicket } from "../types.ts";
import type { Pace } from "./onboarding.ts";

const CONTRIBUTIONS_PER_MONTH = 0.12;   // per partner, scaled by productivity
const QUESTIONS_PER_MONTH = 0.35;        // partner questions, higher while onboarding
const HUB_ANSWER_RATE = 0.6;             // answered by the Support Hub, no ticket (decision 66)
const SLACK_ESCALATION_RATE = 0.03;

export function generateContributions(rng: Rng, partners: Partner[], people: Person[]): Contribution[] {
  const team = groupPeople(people);
  const rows: Omit<Contribution, "id">[] = [];
  for (const p of partners) {
    const start = Math.max(POINTS_FROM, p.terms_accepted_at);
    const end = Math.min(AS_OF, p.activeUntil);
    if (end <= start) continue;
    const rate = CONTRIBUTIONS_PER_MONTH * Math.sqrt(p.weight) * (p.planned_live_at ? 3 : 0.5);
    for (let n = rng.poisson((rate * (end - start)) / (30 * DAY)); n > 0; n -= 1) {
      const submitted = Math.floor(rng.between(start, end) / DAY) * DAY;
      const author = rng.pick((team.get(p.id) ?? []).filter((x) => x.added_at <= submitted));
      if (!author) continue;
      const type = rng.weighted<Contribution["type"]>([["community_answer", 55], ["linkedin_post", 35], ["article", 10]]);
      // Partner marketing reviews each one against the language guide.
      const reviewed = submitted + rng.int(1, 7) * DAY;
      const status = reviewed > AS_OF ? "pending" : rng.chance(0.86) ? "approved" : "rejected";
      rows.push({
        partner_id: p.id, person_id: author.id, type, submitted_at: submitted, status,
        reviewed_at: status === "pending" ? null : reviewed,
        points: status === "approved" ? program.contributions.points[type] : 0,
      });
    }
  }
  return rows.sort((a, b) => a.submitted_at - b.submitted_at || a.person_id.localeCompare(b.person_id))
    .map((row, i) => ({ id: id("CO", i + 1, 5), ...row }));
}

export function generateTickets(rng: Rng, partners: Partner[], accountsFor: Map<string, string[]>): SupportTicket[] {
  const rows: Omit<SupportTicket, "id">[] = [];
  for (const p of partners) {
    const end = Math.min(AS_OF, p.status === "alumni" ? p.alumni_at! : AS_OF);
    for (let month = p.terms_accepted_at; month < end; month += 30 * DAY) {
      const onboarding = p.onboarded_at === null || month < p.onboarded_at;
      const lambda = QUESTIONS_PER_MONTH * (onboarding ? 2.5 : 1) * Math.min(4, 0.7 + Math.sqrt(p.weight) / 3);
      for (let n = rng.poisson(lambda); n > 0; n -= 1) {
        const opened = rng.between(month, Math.min(end, month + 30 * DAY));
        rows.push(ticket(rng, p, opened, onboarding, accountsFor.get(p.id) ?? []));
      }
    }
  }
  return rows.sort((a, b) => a.opened_at - b.opened_at).map((row, i) => ({ id: id("ST", i + 1, 5), ...row }));
}

function ticket(rng: Rng, p: Partner, opened: number, onboarding: boolean, accounts: string[]): Omit<SupportTicket, "id"> {
  const category = onboarding
    ? rng.weighted<SupportTicket["category"]>([["onboarding", 45], ["credentials", 20], ["technical", 25], ["deal_registration", 10]])
    : rng.weighted<SupportTicket["category"]>([["technical", 40], ["deal_registration", 20], ["commissions", 15], ["credentials", 10], ["billing", 15]]);
  const hub = rng.chance(HUB_ANSWER_RATE);
  const slack = !hub && rng.chance(SLACK_ESCALATION_RATE / (1 - HUB_ANSWER_RATE));
  const channel: SupportTicket["channel"] = hub ? "support_hub" : slack ? "slack" : "zendesk";
  // The Hub answers in seconds; urgent Slack escalations within hours; Zendesk
  // within one business day as the target.
  const due = channel === "support_hub" ? opened + 60_000 : channel === "slack" ? opened + 4 * 3_600_000 : addBusinessDays(opened, 1);
  const hours = channel === "support_hub" ? 0.005 : channel === "slack" ? rng.lognormal(1.5, 0.6) : rng.lognormal(10, 0.9);
  const resolved = opened + hours * 3_600_000;
  const done = resolved <= AS_OF;
  return {
    partner_id: p.id,
    account_id: (category === "technical" || category === "billing") && accounts.length ? rng.pick(accounts) : null,
    category, channel, opened_at: opened, resolved_at: done ? resolved : null,
    answered_by_hub: hub, sla_met: done ? resolved <= due : null,
  };
}

export function generateEngagement(rng: Rng, partners: Partner[], paces: Map<string, Pace>): EngagementEvent[] {
  const rows: Omit<EngagementEvent, "id">[] = [];
  const push = (p: Partner, event: EngagementEvent["event"], at: number) => {
    if (at <= AS_OF) rows.push({ partner_id: p.id, event, occurred_at: at });
  };
  for (const p of partners) {
    const pace = paces.get(p.id)!;
    // Stale partners who keep logging in are still inactive: engagement is not selling.
    const end = Math.min(AS_OF, p.keepsEngaging ? AS_OF : p.activeUntil, p.alumni_at ?? AS_OF);
    const busy = Math.min(1, 0.25 + pace.diligence * 0.5 + Math.log(p.weight + 1) / 8);
    for (let month = p.terms_accepted_at; month < end; month += 30 * DAY) {
      const span = Math.min(30 * DAY, end - month);
      const mix: [EngagementEvent["event"], number][] = [
        ["portal_login", 6 * busy], ["slack_message", 4 * busy], ["introw_message", 1.5 * busy],
        ["email", 1], ["course", 1.2 * busy], ["webinar", 0.4 * busy],
      ];
      if (p.onboarded_at === null || month < p.onboarded_at) mix.push(["cohort_session", 1.5 * pace.diligence]);
      for (const [event, rate] of mix) {
        for (let n = rng.poisson((rate * span) / (30 * DAY)); n > 0; n -= 1) push(p, event, rng.between(month, month + span));
      }
    }
  }
  return rows.sort((a, b) => a.occurred_at - b.occurred_at || a.partner_id.localeCompare(b.partner_id))
    .map((row, i) => ({ id: id("E", i + 1, 6), ...row }));
}

function groupPeople(people: Person[]): Map<string, Person[]> {
  const out = new Map<string, Person[]>();
  for (const x of people) out.set(x.partner_id, [...(out.get(x.partner_id) ?? []), x]);
  return out;
}
