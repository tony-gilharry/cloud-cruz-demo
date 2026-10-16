// Stage 2, Onboard: the named people at each partner, each partner's pace
// through the six onboarding items, and the daily health check that catches
// stalls in days, not at day 45 (decisions 40 to 42, 44, 46).
import { AS_OF, DAY, id, program, startOfDay } from "../config.ts";
import { personName } from "../names.ts";
import type { Rng } from "../rng.ts";
import type { Health, Intervention, OnboardingSignal, Partner, PartnerSegment, Person } from "../types.ts";

// Extra technical and business people beyond the three named contacts.
const EXTRA_PEOPLE: Record<PartnerSegment, [number, number]> = { builder: [0, 2], specialist: [2, 6], scale: [6, 16], anchor: [18, 40] };
const STALL_RATE = 0.09;      // partners that stop partway and never finish
const SIGNAL_TAIL_DAYS = 14;  // keep watching this long past the ceiling

export function generatePeople(rng: Rng, partners: Partner[]): Person[] {
  const people: Omit<Person, "id">[] = [];
  for (const p of partners) {
    for (const role of ["executive_sponsor", "technical_lead", "sales_lead"] as const) {
      people.push({ partner_id: p.id, name: personName(rng), role, added_at: p.terms_accepted_at });
    }
    const [min, max] = EXTRA_PEOPLE[p.segment];
    const extra = Math.round(rng.between(min, max) * Math.min(2, 0.6 + Math.log(p.weight + 1) / 3) + (p.planned_live_at ? 1 : 0));
    for (let i = 0; i < extra; i += 1) {
      const added = startOfDay(rng.between(p.terms_accepted_at, Math.max(p.terms_accepted_at, AS_OF - 7 * DAY)));
      people.push({ partner_id: p.id, name: personName(rng), role: rng.chance(0.6) ? "technical" : "business", added_at: added });
    }
  }
  return people
    .sort((a, b) => a.added_at - b.added_at || a.partner_id.localeCompare(b.partner_id))
    .map((row, i) => ({ id: id("PP", i + 1, 5), ...row }));
}

/** The days a partner's plan allows: the managed plan, or its segment ceiling. */
export function planDays(p: Partner): number {
  if (p.onboarding_plan === "accelerated") return program.onboarding.plan_days.accelerated;
  if (p.onboarding_plan === "standard_30") return program.onboarding.plan_days.standard_30;
  return program.onboarding.ceiling_days[p.segment];
}

/** How each partner moves through onboarding. Decided once, read twice. */
export interface Pace {
  completionDay: number | null;  // day the sixth item is done, or null if it stalls
  firstLoginDay: number;
  firstBuildDay: number;
  stallAt: number;               // checklist share where a stalled partner stops
  diligence: number;             // 0 to 1: cohort attendance, Slack, nudges
}

export function planOnboarding(rng: Rng, partners: Partner[]): Map<string, Pace> {
  const paces = new Map<string, Pace>();
  for (const p of partners) {
    const plan = planDays(p);
    // Partners headed for an early live customer onboard briskly.
    const keen = p.planned_live_at !== null || p.dealInHand;
    const diligence = Math.min(1, Math.max(0, rng.normal() * 0.2 + (keen ? 0.75 : 0.55)));
    const stalls = !keen && rng.chance(STALL_RATE);
    const factor = keen ? rng.between(0.55, 1.0) : rng.lognormal(0.95, 0.3);
    const completion = stalls ? null : Math.max(3, Math.round(plan * factor));
    paces.set(p.id, {
      completionDay: completion,
      firstLoginDay: rng.chance(0.9) ? rng.int(1, 2) : rng.int(3, 8),
      firstBuildDay: rng.chance(0.92) ? rng.int(2, 9) : rng.int(10, 20),
      stallAt: rng.between(0.2, 0.6),
      diligence,
    });
    if (completion !== null) {
      const done = p.terms_accepted_at + completion * DAY;
      p.onboarded_at = done <= AS_OF ? done : null;
    }
  }
  return paces;
}

/**
 * One row per partner per day, with the health rules from program.yaml.
 * An intervention is recorded on the day a rule fires. `ignored` partners
 * are the seeded misses: they go cold and nobody acts (edge-cases.ts).
 */
export function buildSignals(
  rng: Rng, partners: Partner[], paces: Map<string, Pace>, firstDealReg: Map<string, number>, ignored: Set<string>,
): OnboardingSignal[] {
  const rules = program.onboarding.early_warning;
  const rows: OnboardingSignal[] = [];
  for (const p of partners) {
    const pace = paces.get(p.id)!;
    const plan = planDays(p);
    const lastDay = Math.min(
      pace.completionDay ?? Infinity,
      program.onboarding.ceiling_days[p.segment] + SIGNAL_TAIL_DAYS,
      Math.floor((AS_OF - p.terms_accepted_at) / DAY) + 1,
    );
    const overlaps = rng.chance(0.6) ? rng.int(1, 25) : 0;
    const reg = firstDealReg.get(p.id) ?? null;
    let builds = 0;
    let cohorts = 0;
    let previous: Health | null = null;
    let nudged = false;

    for (let day = 1; day <= lastDay; day += 1) {
      const at = p.terms_accepted_at + (day - 1) * DAY;
      const progress = pace.completionDay ? day / pace.completionDay : Math.min(pace.stallAt, day / (plan * 1.4));
      const checklist = Math.min(100, Math.round(100 * progress));
      const planPct = Math.min(100, Math.round((100 * day) / plan));
      const loggedIn = day >= pace.firstLoginDay;
      if (day === pace.firstBuildDay || (day > pace.firstBuildDay && rng.chance(0.25 + pace.diligence * 0.3))) builds += 1;
      if (day % 7 === 3 && rng.chance(pace.diligence)) cohorts += 1;
      const dealRegistered = reg !== null && reg <= at + DAY;
      const behind = planPct > 0 ? 1 - checklist / planPct : 0;

      let health: Health = "warm";
      if (dealRegistered || checklist > planPct + 10) health = "hot";
      if ((!loggedIn && day >= rules.no_login_by_day) || behind >= rules.cold_when_behind) health = "cold";

      let intervention: Intervention = "none";
      if (!ignored.has(p.id)) {
        if (!loggedIn && day === rules.no_login_by_day) intervention = "outreach";
        else if (health === "cold" && previous !== "cold") intervention = "person";
        else if (health === "hot" && previous !== "hot" && dealRegistered) intervention = "fast_track";
        else if (builds === 0 && day === rules.no_sandbox_build_by_day) intervention = "office_hours";
        else if (!nudged && behind >= rules.nudge_when_behind) {
          intervention = "nudge";
          nudged = true;
        }
      }
      previous = health;

      rows.push({
        partner_id: p.id, day: at, day_number: day, logged_in: loggedIn, checklist_pct: checklist, plan_pct: planPct,
        accreditations: progress >= 0.85 ? 2 : progress >= 0.6 ? 1 : 0, sandbox_builds: builds, cohort_sessions: cohorts,
        slack_active: rng.chance(0.2 + pace.diligence * 0.5), crossbeam_overlaps: day >= 5 ? overlaps : 0,
        deal_registered: dealRegistered, health, intervention,
      });
    }
  }
  return rows;
}

/**
 * People stepping in to rescue onboarding. The nudge is automated, and a fast
 * track is co-sell news (the partner registered a deal), not onboarding help,
 * so neither counts against "70% of the long tail with no human touch" (decision 66).
 */
export const HUMAN_TOUCH: Intervention[] = ["outreach", "person", "office_hours"];
