// Loads the two YAML rule files and the fixed clock the generator runs on.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { CredentialStep, PartnerSegment, PricingPlan, Tier } from "./types.ts";

export const SEED = 20260924;
export const DAY = 86_400_000;

export interface AttributionConfig {
  sourced: { max_days_before_opportunity: number };
  influenced: { window_days: number; touch_weights: Record<string, number> };
  active_partner: { window_days: number };
}

export interface TierRule {
  name: Tier;
  certified_people: number;
  level_2_plus: number;
  level_3: number;
  live_joint_customers: number;
  public_references: number;
  sourced_revenue: number;
  contribution_points: number;
  commission_rate: number;
  free_exams_per_year: number;
  invite_only?: boolean;
}

export interface ProgramConfig {
  timeline: { beta_start: string; launch: string; technology_path_opens: string; resellers_and_marketplace_open: string; as_of: string };
  tiers: TierRule[];
  reviews: {
    promotion_check: "monthly"; promotion_within_days: number; demotion_review: string;
    demotion_notice_days: number; elite_invitations: string; rules_hold_months: number;
  };
  pricing_plans: Record<PricingPlan, { billing: "monthly" | "quarterly"; min_acv?: number; max_acv?: number }>;
  commissions: {
    hold_days: number; payout_day_of_month: number; clawback_days: number; term_months: number;
    renewal_rate: number | null; marketplace_partner_of_record_rate: number; paying_roles: string[];
    accelerators: null;
    spiffs: { effective: string; first_customer_live: number; first_enterprise_live: number; retained_12_months: number };
  };
  implementation_package: {
    consulting_rate: number; technical_rate: number; requires_level_2_technical: boolean; beta_budget: number;
    beta_psa_stands_in: boolean; eligible_roles: string[];
    bands: { band: "50k_150k" | "150k_500k" | "500k_plus"; min_acv: number; consulting_hours: number; technical_hours: number }[];
  };
  credentials: { issuer: string; level_valid_days: number; product_use_days: number };
  exams: { fees: Record<Exclude<CredentialStep, "sales_accreditation" | "technical_accreditation">, number>;
    program_year_starts: string; accelerated_plan_extra_per_person: number; anchor_extra_per_year: number };
  onboarding: {
    ceiling_days: Record<PartnerSegment, number>;
    plan_days: { standard_30: number; accelerated: number };
    early_warning: { no_login_by_day: number; nudge_when_behind: number; cold_when_behind: number; no_sandbox_build_by_day: number };
  };
  leads: {
    fit: { auto_approve: number; human_review: number; weights: Record<string, number> };
    intent: { application: number; meeting: number; timeline: Record<"now" | "this_quarter" | "later", number>;
      events_each: number; events_max: number; content_max: number; half_life_days: number; high: number };
    routing: { daily_capacity_per_rep: number; human_review_max_rate: number; audit_rate: number; person_approves_every_send: boolean };
  };
  deal_registration: { sla_business_days: number; protection_days: number; products: string[] };
  co_marketing: { tiers: Tier[]; campaign_sizes: number[] };
  contributions: { effective: string; points: Record<"community_answer" | "linkedin_post" | "article", number> };
  inactivity: { at_risk_days: number; reactivation_days: number; alumni_days: number };
  team: { headcount: number };
}

function loadYaml<T>(file: string): T {
  const path = fileURLToPath(new URL(`../config/${file}`, import.meta.url));
  return parse(readFileSync(path, "utf8")) as T;
}

export const attribution = loadYaml<AttributionConfig>("attribution.yaml");
export const program = loadYaml<ProgramConfig>("program.yaml");

/** A YAML date like 2027-04-01 as UTC epoch milliseconds. */
export const dateMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
// A fixed "today" instead of now(), so a re-seed next month produces the same
// rows. The data runs from the beta's first day to the end of Year 1 (decision 87).
export const WINDOW_START = dateMs(program.timeline.beta_start);
export const LAUNCH = dateMs(program.timeline.launch);
export const TECH_OPENS = dateMs(program.timeline.technology_path_opens);
export const H2_OPENS = dateMs(program.timeline.resellers_and_marketplace_open);
export const AS_OF = dateMs(program.timeline.as_of) + DAY - 1000; // 23:59:59 that day
export const SPIFFS_FROM = dateMs(program.commissions.spiffs.effective);
export const POINTS_FROM = dateMs(program.contributions.effective);

export const TIER_ORDER: Tier[] = program.tiers.map((t) => t.name);
export const tierRule = (tier: Tier): TierRule => program.tiers.find((t) => t.name === tier)!;
export const tierRank = (tier: Tier): number => TIER_ORDER.indexOf(tier);

/** Zero-padded readable ids: id("P", 7, 4) -> "P0007". */
export const id = (prefix: string, n: number, width: number): string =>
  `${prefix}${String(n).padStart(width, "0")}`;

export const startOfDay = (ms: number): number => Math.floor(ms / DAY) * DAY;

/** Adds business days, skipping Saturday and Sunday (deal registration SLA). */
export function addBusinessDays(ms: number, days: number): number {
  let at = ms;
  let left = days;
  while (left > 0) {
    at += DAY;
    const weekday = new Date(at).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return at;
}

/** First day of the month containing ms. */
export const monthStart = (ms: number): number => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/** Adds whole calendar months. */
export const addMonths = (ms: number, months: number): number => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
};
