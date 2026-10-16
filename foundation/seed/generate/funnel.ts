// Stage 0 and Stage 1: the partner team, every lead the PDR worked, and the
// partners those leads became. Partners are scheduled first (25 beta design
// partners, then a launch ramp to about 1,000), and each one's lead history
// is built backwards from its signing date. Leads that never converted fill
// the funnel to about 70 a week (decisions 15, 34 to 39, 65, 68 to 70).
import {
  AS_OF, DAY, H2_OPENS, LAUNCH, addMonths, TECH_OPENS, WINDOW_START, addBusinessDays, id, program, startOfDay,
} from "../config.ts";
import { partnerName, personName } from "../names.ts";
import type { Rng } from "../rng.ts";
import type { Partner, PartnerLead, PartnerSegment, PartnerType, Region, TeamMember, Temperature } from "../types.ts";

// Synthetic-world assumptions. Program rules live in program.yaml.
const BETA_PARTNERS = 25;
const BETA_ISVS = 4;
const LAUNCH_SIGNINGS = { first: 40, last: 122 };  // per month, Apr 2027 to Mar 2028
const LEADS_PER_WEEK = { first: 35, last: 110 };   // ramps across the window
const REGION_MIX: [Region, number][] = [["us", 70], ["canada", 10], ["uk_ireland", 10], ["anz", 5], ["latam", 5]];
const PROJECT_VALUE_MEDIAN: Record<PartnerSegment, number> = { anchor: 250_000, scale: 90_000, specialist: 45_000, builder: 15_000 };
const SEGMENT_WEIGHT: Record<PartnerSegment, number> = { anchor: 6, scale: 3, specialist: 1.4, builder: 0.8 };
const ANCHORS = 12;
const MANAGED_SPECIALISTS = 12;

// Activation (decisions 65, 90): the share of each monthly cohort with a live
// joint customer within 90 days climbs from about 20% to 40%.
const EARLY_RATE = { beta: 0.25, first: 0.15, last: 0.36 };
const LATE_RATE = 0.08;              // activates after day 90, if ever
const SEGMENT_LIFT: Record<PartnerSegment, number> = { anchor: 1.8, scale: 1.5, specialist: 1.1, builder: 0.85 };

export interface Funnel {
  team: TeamMember[];
  leads: PartnerLead[];
  partners: Partner[];
}

export function generateTeam(rng: Rng): TeamMember[] {
  const roles: TeamMember["role"][] = [
    "head_of_partner_ops", "pdr", "partner_manager", "partner_manager", "partner_account_manager",
    "partner_solutions_architect", "enablement", "partner_operations", "partner_marketing",
  ];
  const used = new Set<string>();
  return roles.map((role, i) => {
    let name = personName(rng);
    while (used.has(name)) name = personName(rng);
    used.add(name);
    return { id: id("U", i + 1, 2), name, role };
  });
}

export function generateFunnel(rng: Rng, team: TeamMember[]): Funnel {
  const pdr = team.find((t) => t.role === "pdr")!;
  const managers = team.filter((t) => t.role === "partner_manager");
  const pam = team.find((t) => t.role === "partner_account_manager")!;
  const names = new Set<string>();

  // 1. Who signs, and when.
  const signings = signingSchedule(rng);
  let anchorsLeft = ANCHORS;
  let managedSpecialistsLeft = MANAGED_SPECIALISTS;
  const drafts = signings.map((signed, i) => {
    const beta = i < BETA_PARTNERS;
    const type = partnerType(rng, signed, beta, i);
    let segment = partnerSegment(rng, type);
    // Anchors are invited from a short list, spread across the year.
    if (anchorsLeft > 0 && !beta && (type === "SI" || type === "agency") && rng.chance(0.02)) {
      segment = "anchor";
      anchorsLeft -= 1;
    }
    return { signed, beta, type, segment };
  });

  const partners: Partner[] = [];
  const leads: Omit<PartnerLead, "id">[] = [];
  drafts.forEach((d, i) => {
    const company = partnerName(rng, names, d.type);
    // Anchor and Scale partners are managed, plus a few Specialists (decision 40).
    let managed = d.segment === "anchor" || d.segment === "scale";
    if (d.segment === "specialist" && managedSpecialistsLeft > 0 && rng.chance(0.06)) {
      managed = true;
      managedSpecialistsLeft -= 1;
    }
    const lead = convertedLead(rng, company, d, pdr.id);
    leads.push(lead);
    partners.push(partnerFrom(rng, i, company, d, lead, managed, managers, pam.id));
  });

  // 2. Leads that did not convert, to fill the funnel to its weekly volume.
  for (const created of openLeadTimes(rng, leads.length)) {
    const type = partnerType(rng, created, false, BETA_PARTNERS + 1);
    leads.push(unconvertedLead(rng, partnerName(rng, names, type), type, partnerSegment(rng, type), created, pdr.id));
  }

  // Lead ids run in creation order; partners keep a pointer to their lead.
  const order = leads.map((l, i) => [l, i] as const).sort((a, b) => a[0].created_at - b[0].created_at);
  const leadIds = new Map<number, string>();
  const withIds = order.map(([lead, i], n) => {
    leadIds.set(i, id("L", n + 1, 5));
    return { ...lead, id: id("L", n + 1, 5) };
  });
  partners.forEach((p, i) => (p.lead_id = leadIds.get(i)!));
  return { team, leads: withIds, partners };
}

// ---------------------------------------------------------------------------
// Scheduling

/** Signing dates: the beta cohort in its first month, then a monthly launch ramp. */
function signingSchedule(rng: Rng): number[] {
  const dates: number[] = [];
  for (let i = 0; i < BETA_PARTNERS; i += 1) dates.push(startOfDay(rng.between(WINDOW_START, WINDOW_START + 30 * DAY)));
  for (let month = 0; month < 12; month += 1) {
    const start = addMonths(LAUNCH, month);
    const end = addMonths(LAUNCH, month + 1);
    const count = Math.round(LAUNCH_SIGNINGS.first + ((LAUNCH_SIGNINGS.last - LAUNCH_SIGNINGS.first) * month) / 11);
    const monthDates = Array.from({ length: count }, () => startOfDay(rng.between(start, Math.min(end, AS_OF) - DAY)));
    dates.push(...monthDates.sort((a, b) => a - b));
  }
  return dates;
}

/** Creation times for unconverted leads, on a weekly ramp, minus the converted ones. */
function openLeadTimes(rng: Rng, converted: number): number[] {
  const start = WINDOW_START - 60 * DAY;
  const weeks = Math.ceil((AS_OF - start) / (7 * DAY));
  const times: number[] = [];
  let total = 0;
  for (let w = 0; w < weeks; w += 1) total += LEADS_PER_WEEK.first + ((LEADS_PER_WEEK.last - LEADS_PER_WEEK.first) * w) / (weeks - 1);
  const share = Math.max(0, 1 - converted / total);
  for (let w = 0; w < weeks; w += 1) {
    const perWeek = LEADS_PER_WEEK.first + ((LEADS_PER_WEEK.last - LEADS_PER_WEEK.first) * w) / (weeks - 1);
    for (let n = rng.poisson(perWeek * share); n > 0; n -= 1) {
      const at = start + (w + rng.next()) * 7 * DAY;
      if (at <= AS_OF) times.push(at);
    }
  }
  return times;
}

function partnerType(rng: Rng, at: number, beta: boolean, index: number): PartnerType {
  // The beta is about 20 agencies and boutique consultancies plus 4 ISVs.
  if (beta) return index < BETA_ISVS ? "ISV" : rng.chance(0.75) ? "agency" : "SI";
  const mix: [PartnerType, number][] = [["agency", 65], ["SI", 35]];
  if (at >= TECH_OPENS) mix.push(["ISV", 25], ["tech", 15]);
  if (at >= H2_OPENS) mix.push(["reseller", 20]);
  return rng.weighted(mix);
}

function partnerSegment(rng: Rng, type: PartnerType): PartnerSegment {
  // Builders and Specialists by count; Scale is a few (decision 28).
  if (type === "ISV" || type === "tech") return rng.weighted<PartnerSegment>([["specialist", 45], ["builder", 55]]);
  if (type === "reseller") return rng.weighted<PartnerSegment>([["scale", 8], ["builder", 92]]);
  if (type === "SI") return rng.weighted<PartnerSegment>([["scale", 14], ["specialist", 46], ["builder", 40]]);
  return rng.weighted<PartnerSegment>([["scale", 3], ["specialist", 27], ["builder", 70]]);
}

// ---------------------------------------------------------------------------
// Converted leads and the partners they became

interface Draft { signed: number; beta: boolean; type: PartnerType; segment: PartnerSegment }

function convertedLead(rng: Rng, company: string, d: Draft, owner: string): Omit<PartnerLead, "id"> {
  const outbound = d.segment === "anchor" || d.beta || rng.chance(0.35);
  const dealInHand = !d.beta && rng.chance(0.04);
  // Work backwards from signing: terms, acceptance, application, meeting.
  const created = d.signed - rng.between(outbound ? 25 : 10, outbound ? 70 : 40) * DAY;
  const meeting = Math.max(created + DAY, Math.min(created + rng.between(2, 10) * DAY, d.signed - 8 * DAY));
  const fit = d.segment === "anchor" ? rng.int(85, 98) : clamp(Math.round(rng.normal() * 9 + 78), 52, 99);
  const timeline = dealInHand ? "now" : rng.weighted<"now" | "this_quarter" | "later">([["now", 45], ["this_quarter", 45], ["later", 10]]);
  const events = rng.weighted([[0, 40], [10, 35], [20, 25]] as const);
  const intent = {
    intent_application: program.leads.intent.application,
    intent_meeting: program.leads.intent.meeting,
    intent_timeline: program.leads.intent.timeline[timeline],
    intent_events: events,
    intent_content: rng.int(0, program.leads.intent.content_max),
  };
  const intentScore = Object.values(intent).reduce((s, v) => s + v, 0);
  const temperature = temperatureFor(fit, intentScore, dealInHand);
  return {
    company, type: d.type, segment: d.segment, region: d.segment === "anchor" ? "us" : rng.weighted(REGION_MIX),
    motion: outbound ? "outbound" : "inbound", owner_id: owner, created_at: created, fit_score: fit, ...intent,
    intent_score: intentScore, last_signal_at: meeting, deal_in_hand: dealInHand, temperature,
    route: routeFor(temperature), ...judgment(rng, meeting, timeline), audited: rng.chance(program.leads.routing.audit_rate),
    meeting_at: meeting, handoff_at: addBusinessDays(meeting, rng.chance(0.9) ? 0 : 1) + rng.between(1, 6) * 3_600_000,
    outcome: "converted",
  };
}

function partnerFrom(
  rng: Rng, index: number, company: string, d: Draft, lead: Omit<PartnerLead, "id">,
  managed: boolean, managers: TeamMember[], pamId: string,
): Partner {
  const procurement = rng.chance(d.segment === "anchor" ? 0.8 : d.segment === "scale" ? 0.5 : 0.08);
  const review = lead.fit_score < program.leads.fit.auto_approve;
  const terms = d.signed;
  const accepted = terms - (procurement ? rng.between(10, 30) : rng.between(0, 6)) * DAY;
  const applied = accepted - (review ? rng.between(3, 9) : rng.between(1, 4)) * DAY;
  const weight = Math.min(rng.pareto(1.5), 60) * SEGMENT_WEIGHT[d.segment];
  const plan = managed ? (rng.chance(0.3) ? "accelerated" : "standard_30") : "automated";

  return {
    id: id("P", index + 1, 4),
    name: company,
    lead_id: "",
    type: d.type,
    segment: d.segment,
    path: d.type === "ISV" || d.type === "tech" ? "technology" : "services",
    region: lead.region,
    beta: d.beta,
    fit_score: lead.fit_score,
    fit_outcome: review ? "human_review" : "auto_approved",
    review_reason: review ? rng.pick(REVIEW_REASONS) : null,
    // Applied, then accepted, then terms: never out of order.
    applied_at: startOfDay(Math.min(applied, accepted)),
    accepted_at: startOfDay(Math.min(accepted, terms)),
    agreement_path: procurement ? "procurement" : "click_through",
    terms_accepted_at: terms,
    onboarding_plan: plan,
    partner_manager_id: managers[index % managers.length].id,
    partner_account_manager_id: managed ? pamId : null,
    onboarded_at: null,
    first_deal_registration_at: null,
    first_closed_won_at: null,
    first_live_customer_at: null,
    activation_rating: null,
    tier: "Member",
    elite_invited: false,
    status: "active",
    alumni_at: null,
    delivery_maturity: clamp(Math.round(1.5 + Math.log(weight + 1) * 0.8 + rng.normal() * 0.6), 1, 5),
    avg_project_value: Math.round(rng.lognormal(PROJECT_VALUE_MEDIAN[d.segment], 0.4)),
    weight,
    activeUntil: AS_OF,
    keepsEngaging: false,
    planned_live_at: plannedLive(rng, terms, d.segment, lead.deal_in_hand, d.beta, weight),
    dealInHand: lead.deal_in_hand,
  };
}

const REVIEW_REASONS = [
  "Strong AI practice, client base still growing",
  "Referred by an existing design partner",
  "Specialist in a priority vertical",
  "Deal in hand with a named customer",
  "Hyperscaler-certified team, small client list",
];

/** When the partner's first joint customer goes live, or null if it does not by the as-of date. */
function plannedLive(rng: Rng, signed: number, segment: PartnerSegment, dealInHand: boolean, beta: boolean, weight: number): number | null {
  const progress = Math.min(1, Math.max(0, (signed - LAUNCH) / (addMonths(LAUNCH, 8) + 14 * DAY - LAUNCH)));
  // Design partners were picked for fit, so the beta cohort activates like a good launch month.
  const base = beta ? EARLY_RATE.beta : EARLY_RATE.first + (EARLY_RATE.last - EARLY_RATE.first) * progress;
  // Productive firms are the ones that get a customer live (the Pareto weight).
  const lift = SEGMENT_LIFT[segment] * Math.min(2.2, Math.max(0.5, 0.45 + 0.4 * Math.log(1 + weight)));
  const early = Math.min(0.9, base * lift);
  let days: number;
  if (dealInHand || rng.chance(early)) days = rng.between(dealInHand ? 20 : 28, 90);
  else if (rng.chance(LATE_RATE * lift)) days = rng.between(91, 330);
  else return null;
  const at = startOfDay(signed + days * DAY);
  return at <= AS_OF ? at : null;
}

// ---------------------------------------------------------------------------
// Leads that did not convert

function unconvertedLead(
  rng: Rng, company: string, type: PartnerType, segment: PartnerSegment, created: number, owner: string,
): Omit<PartnerLead, "id"> {
  const outbound = rng.chance(0.55);
  const fit = clamp(Math.round(rng.normal() * 17 + 55), 5, 95);
  const replied = outbound ? rng.chance(0.35) : true;
  const applied = !outbound && rng.chance(0.4);
  const timeline = replied ? rng.weighted<"now" | "this_quarter" | "later">([["now", 15], ["this_quarter", 35], ["later", 50]]) : null;
  const intent = {
    intent_application: applied ? program.leads.intent.application : 0,
    intent_meeting: replied ? program.leads.intent.meeting : 0,
    intent_timeline: timeline ? program.leads.intent.timeline[timeline] : 0,
    intent_events: rng.weighted([[0, 70], [10, 22], [20, 8]] as const),
    intent_content: rng.int(0, program.leads.intent.content_max),
  };
  const intentScore = Object.values(intent).reduce((s, v) => s + v, 0);
  const temperature = temperatureFor(fit, intentScore, false);
  const lastSignal = created + rng.between(0, 20) * DAY;
  const meeting = replied && rng.chance(0.5) ? created + rng.between(3, 15) * DAY : null;
  const recent = created > AS_OF - 30 * DAY;
  const outcome = recent ? "open" : fit < program.leads.fit.human_review ? "nurture" : rng.chance(0.35) ? "disqualified" : "nurture";
  return {
    company, type, segment, region: rng.weighted(REGION_MIX), motion: outbound ? "outbound" : "inbound", owner_id: owner,
    created_at: created, fit_score: fit, ...intent, intent_score: intentScore, last_signal_at: Math.min(lastSignal, AS_OF),
    deal_in_hand: false, temperature, route: routeFor(temperature),
    ...(timeline ? judgment(rng, Math.min(meeting ?? lastSignal, AS_OF), timeline) : noJudgment()),
    audited: rng.chance(program.leads.routing.audit_rate),
    meeting_at: meeting && meeting <= AS_OF ? meeting : null, handoff_at: null, outcome,
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers

/** Fit x intent routing (decision 35, document 03 "Who to call today"). */
export function temperatureFor(fit: number, intent: number, dealInHand: boolean): Temperature {
  if (dealInHand) return "urgent";
  const highFit = fit >= program.leads.fit.auto_approve;
  const highIntent = intent >= program.leads.intent.high;
  if (highFit && highIntent) return "hot";
  if (highFit || highIntent) return "warm";
  return "nurture";
}

/**
 * In Year 1 people work hot and urgent leads; warm and nurture leads get the
 * automated sequence. Agent drafts arrive with build 3 (decisions 34, 70).
 */
const routeFor = (t: Temperature): PartnerLead["route"] => (t === "hot" || t === "urgent" ? "person" : "nurture");

/**
 * The stated-timeline judgment. The typed-decision layer is run by hand in
 * Year 1 (decision 69), so the PDR records it and there is no model
 * confidence yet. Build 3 fills these fields from the live model.
 */
function judgment(rng: Rng, at: number, timeline: "now" | "this_quarter" | "later") {
  return {
    stated_timeline: timeline, judgment_confidence: null, judgment_model: "manual",
    judged_at: Math.min(AS_OF, at + rng.between(0, 1) * DAY), human_review: false,
  };
}

const noJudgment = () => ({ stated_timeline: null, judgment_confidence: null, judgment_model: null, judged_at: null, human_review: false });

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
