// Deals: opportunities, deal registrations, deal touches and the partner-role
// roster, generated together because they reference each other.
//
// Every partner with a planned first live customer gets a deal built
// backwards from that date, so the activation targets hold by construction.
// All other deals are shaped forward and then checked: a deal may only go
// live through a partner on or after that partner's planned first live date,
// so no deal quietly activates a partner the plan says is not activated.
import { AS_OF, DAY, H2_OPENS, WINDOW_START, addBusinessDays, attribution, id, program, startOfDay } from "../config.ts";
import { createSampler, type Rng } from "../rng.ts";
import type {
  Account, DealRegistration, Marketplace, Opportunity, OpportunityPartner, Partner, PartnerRole,
  PartnerSegment, PricingPlan, Product, Segment, Touch, TouchType,
} from "../types.ts";

export const HOUR = 3_600_000;

// Synthetic-world assumptions.
const DIRECT_DEALS = 3000;
const MARKETPLACE_DEALS = 140;
const EXTRA_DEALS_PER_MONTH = 0.045;    // sourced deals per partner-month, scaled by weight
const IMPLEMENTER_FIRST_LIVE = 0.2;     // first live customer as implementer on a direct deal
const SERVICES_ROUTED_BACK = 0.6;       // influenced wins where the influencer is offered the build
const TWO_PARTNER_DEALS = 30;           // one partner sources, another implements (decision 85)
const PLAN_BY_SEGMENT: Record<PartnerSegment, [PricingPlan, number][]> = {
  builder: [["self_serve", 45], ["premium", 45], ["enterprise", 10]],
  specialist: [["self_serve", 20], ["premium", 50], ["enterprise", 30]],
  scale: [["self_serve", 5], ["premium", 40], ["enterprise", 55]],
  anchor: [["premium", 25], ["enterprise", 75]],
};
const PLAN_BY_ACCOUNT: Record<Segment, [PricingPlan, number][]> = {
  smb: [["self_serve", 55], ["premium", 40], ["enterprise", 5]],
  midmarket: [["self_serve", 15], ["premium", 55], ["enterprise", 30]],
  enterprise: [["premium", 25], ["enterprise", 75]],
};
const ACV_MEDIAN: Record<PricingPlan, number> = { self_serve: 5_500, premium: 24_000, enterprise: 120_000 };
const CYCLE_DAYS: Record<PricingPlan, [number, number]> = { self_serve: [1, 14], premium: [20, 60], enterprise: [50, 140] };
const GO_LIVE_DAYS: Record<PricingPlan, [number, number]> = { self_serve: [0, 5], premium: [10, 35], enterprise: [25, 70] };
const WIN_RATE = { sourced: 0.42, direct: 0.28, influenced: 0.36, marketplace: 0.45, self_serve_bonus: 0.2 };
const MARKETPLACE_MIX: [Marketplace, number][] = [["aws", 55], ["gcp", 25], ["azure", 20]];

export interface Pipeline {
  opportunities: Opportunity[];
  roster: OpportunityPartner[];
  dealRegistrations: DealRegistration[];
  touches: Touch[];
  /** Opportunities seeded as two-partner deals, for the evaluation labels. */
  twoPartner: Set<Opportunity>;
}

interface Ctx {
  rng: Rng;
  accounts: Account[];
  out: Pipeline;
  partners: Partner[];
  nextTemp: number;
  roles: Map<string, Set<string>>;   // temp opportunity id -> "partner|role" already on it
}

export function generatePipeline(rng: Rng, partners: Partner[], accounts: Account[]): Pipeline {
  const ctx: Ctx = {
    rng, accounts, partners, nextTemp: 0, roles: new Map(),
    out: { opportunities: [], roster: [], dealRegistrations: [], touches: [], twoPartner: new Set() },
  };

  // 1. Each activating partner's first live customer, on its planned date.
  for (const p of partners) {
    if (p.planned_live_at === null) continue;
    if (rng.chance(IMPLEMENTER_FIRST_LIVE) && p.segment !== "builder") implementedFirstLive(ctx, p);
    else sourcedFirstLive(ctx, p);
  }
  // 2. More sourced deals over each partner's life: won, lost and open.
  for (const p of partners) extraSourcedDeals(ctx, p);
  // 3. The direct team's deals, some influenced or implemented by partners.
  for (let i = 0; i < DIRECT_DEALS; i += 1) directDeal(ctx, rng.between(WINDOW_START - 120 * DAY, AS_OF - DAY));
  // 4. Cloud marketplace co-sell, from the second half.
  for (let i = 0; i < MARKETPLACE_DEALS; i += 1) marketplaceDeal(ctx, rng.between(H2_OPENS, AS_OF - DAY));
  // 5. Two-partner deals and registrations that never became deals.
  seedTwoPartnerDeals(ctx);
  backgroundRegistrations(ctx);

  assignIds(ctx.out);
  return ctx.out;
}

// ---------------------------------------------------------------------------
// The rule that keeps activation honest

/** Can this partner be credited on a deal that goes live on this date? */
export function mayGoLiveThrough(p: Partner, goLive: number | null): boolean {
  if (goLive === null || goLive > AS_OF) return true;
  return p.planned_live_at !== null && goLive >= p.planned_live_at && goLive <= p.activeUntil;
}

// ---------------------------------------------------------------------------
// First live customers

function sourcedFirstLive(ctx: Ctx, p: Partner): void {
  const { rng } = ctx;
  const goLive = p.planned_live_at!;
  const room = (goLive - p.terms_accepted_at) / DAY;
  // Pick a plan whose cycle fits between signing and go-live.
  const plan: PricingPlan = room < 35 ? "self_serve" : room < 90 && rng.chance(0.6) ? "self_serve" : rng.weighted(PLAN_BY_SEGMENT[p.segment]);
  const lag = rng.between(...GO_LIVE_DAYS[plan]) * DAY;
  const close = Math.max(goLive - lag, p.terms_accepted_at + 3 * DAY);
  const regAt = p.terms_accepted_at + rng.between(0, Math.min(10, Math.max(1, (close - p.terms_accepted_at) / DAY / 3))) * DAY;
  const created = Math.min(close - DAY, regAt + rng.between(1, 3) * DAY);
  const account = pickAccount(ctx, plan);
  const opp = baseOpp(ctx, account, plan, created, "partner_sourced");
  closeWon(opp, close, goLive);
  opp.sourcing_partner_id = p.id;
  sourcedSignals(ctx, p, opp, regAt, true);
  maybeReference(rng, opp);
  ctx.out.opportunities.push(opp);
}

function implementedFirstLive(ctx: Ctx, p: Partner): void {
  const { rng } = ctx;
  const goLive = p.planned_live_at!;
  const plan: PricingPlan = rng.chance(0.6) ? "enterprise" : "premium";
  const close = goLive - rng.between(...GO_LIVE_DAYS[plan]) * DAY;
  const created = close - rng.between(...CYCLE_DAYS[plan]) * DAY;
  const opp = baseOpp(ctx, pickAccount(ctx, plan), plan, created, "direct");
  closeWon(opp, close, goLive);
  // The AE brought the partner in to deliver after close.
  const at = Math.max(close + DAY, p.terms_accepted_at + DAY);
  addTouch(ctx, opp, p.id, "implementation", Math.min(at, goLive));
  addRole(ctx, opp, p.id, "implementer", Math.min(at, goLive));
  maybeReference(rng, opp);
  ctx.out.opportunities.push(opp);
}

// ---------------------------------------------------------------------------
// Forward-shaped deals

function extraSourcedDeals(ctx: Ctx, p: Partner): void {
  const { rng } = ctx;
  const end = Math.min(p.activeUntil, AS_OF - DAY);
  // An activated partner's repeat business builds from its first go-live.
  const from = p.planned_live_at ? Math.max(p.terms_accepted_at + 5 * DAY, p.planned_live_at - 45 * DAY) : p.terms_accepted_at + 5 * DAY;
  const months = (end - from) / (30 * DAY);
  if (months <= 0) return;
  // Activated partners keep selling; the rest register and mostly lose.
  const rate = EXTRA_DEALS_PER_MONTH * Math.pow(p.weight, 1.0) * (p.planned_live_at ? 1.8 : 0.5);
  for (let n = rng.poisson(rate * months); n > 0; n -= 1) {
    const created = rng.between(from, end);
    const plan = rng.weighted(PLAN_BY_SEGMENT[p.segment]);
    const opp = baseOpp(ctx, pickAccount(ctx, plan), plan, created, "partner_sourced");
    shapeForward(ctx, opp, WIN_RATE.sourced + (plan === "self_serve" ? WIN_RATE.self_serve_bonus : 0), p.activeUntil);
    if (!mayGoLiveThrough(p, opp.go_live_at)) loseInstead(opp);
    opp.sourcing_partner_id = p.id;
    const signal = Math.max(p.terms_accepted_at, created - rng.between(1, 15) * DAY);
    sourcedSignals(ctx, p, opp, signal, rng.chance(0.7));
    maybeReference(rng, opp);
    ctx.out.opportunities.push(opp);
  }
}

function directDeal(ctx: Ctx, created: number): void {
  const { rng } = ctx;
  const account = rng.pick(ctx.accounts);
  const plan = rng.weighted(PLAN_BY_ACCOUNT[account.segment]);
  const influenced = plan !== "self_serve" && rng.chance(0.3);
  const opp = baseOpp(ctx, account, plan, created, "direct");
  shapeForward(ctx, opp, influenced ? WIN_RATE.influenced : WIN_RATE.direct, AS_OF);
  if (opp.created_at < WINDOW_START && (opp.closed_at ?? AS_OF) < WINDOW_START) return; // closed before the window
  ctx.out.opportunities.push(opp);

  const influencers: Partner[] = [];
  if (influenced) {
    for (let i = rng.int(1, 3); i > 0; i -= 1) {
      // Spread across the 130 days before close so some fall outside the
      // 90-day influence window. Evals check the window is respected.
      const end = opp.closed_at ?? AS_OF;
      const at = Math.max(opp.created_at - 10 * DAY, end - rng.between(0, 130) * DAY);
      const partner = activePartner(ctx, at, () => true);
      if (!partner) continue;
      const type = rng.weighted<TouchType>([["co_sell", 55], ["influence", 45]]);
      addTouch(ctx, opp, partner.id, type, at);
      addRole(ctx, opp, partner.id, "influenced", at);
      influencers.push(partner);
    }
  }
  // Won deals that need delivery bring in a partner to implement. The partner
  // that helped close it gets first offer; the customer can still choose (decision 94).
  const routedBack = influencers.length > 0 && rng.chance(SERVICES_ROUTED_BACK);
  if (opp.won && plan !== "self_serve" && (routedBack || rng.chance(0.18))) {
    const at = opp.closed_at! + rng.between(2, 15) * DAY;
    const first = routedBack ? influencers.find((p) => at <= p.activeUntil && mayGoLiveThrough(p, opp.go_live_at)) : undefined;
    const partner = first ?? activePartner(ctx, at, (p) => mayGoLiveThrough(p, opp.go_live_at));
    if (partner && at <= AS_OF) {
      addTouch(ctx, opp, partner.id, "implementation", at);
      addRole(ctx, opp, partner.id, "implementer", at);
    }
  }
}

function marketplaceDeal(ctx: Ctx, created: number): void {
  const { rng } = ctx;
  const plan: PricingPlan = rng.chance(0.6) ? "enterprise" : "premium";
  const opp = baseOpp(ctx, pickAccount(ctx, plan), plan, created, "marketplace");
  opp.marketplace = rng.weighted(MARKETPLACE_MIX);
  shapeForward(ctx, opp, WIN_RATE.marketplace, AS_OF);
  const partner = activePartner(ctx, created, (p) => ["reseller", "SI", "ISV"].includes(p.type) && mayGoLiveThrough(p, opp.go_live_at));
  if (!partner) return;
  ctx.out.opportunities.push(opp);
  addRole(ctx, opp, partner.id, "partner_of_record", created);
  if (rng.chance(0.6)) addTouch(ctx, opp, partner.id, "co_sell", midDeal(rng, opp));
}

// ---------------------------------------------------------------------------
// Two-partner deals (decision 85): one partner sources, another implements.

function seedTwoPartnerDeals(ctx: Ctx): void {
  const { rng } = ctx;
  const candidates = ctx.out.opportunities.filter(
    (o) => o.source === "partner_sourced" && o.won && o.pricing_plan !== "self_serve" && o.go_live_at !== null && o.go_live_at <= AS_OF,
  );
  for (const opp of sample(rng, candidates, TWO_PARTNER_DEALS)) {
    const at = opp.closed_at! + rng.between(2, 10) * DAY;
    const implementer = activePartner(ctx, at, (p) => p.id !== opp.sourcing_partner_id && p.segment !== "builder" && mayGoLiveThrough(p, opp.go_live_at));
    if (!implementer) continue;
    addTouch(ctx, opp, implementer.id, "implementation", at);
    addRole(ctx, opp, implementer.id, "implementer", at);
    ctx.out.twoPartner.add(opp);
  }
}

// ---------------------------------------------------------------------------
// Shapes

function baseOpp(ctx: Ctx, account: Account, plan: PricingPlan, created: number, source: Opportunity["source"]): Opportunity {
  const { rng } = ctx;
  ctx.nextTemp += 1;
  return {
    id: `tmp${ctx.nextTemp}`, account_id: account.id, pricing_plan: plan, amount: acv(rng, plan),
    term_months: plan === "self_serve" ? 1 : plan === "premium" ? 12 : rng.weighted([[12, 60], [24, 25], [36, 15]] as const),
    stage: "prospecting", created_at: created, closed_at: null, won: null, go_live_at: null, source,
    sourcing_partner_id: null, marketplace: null,
    competitive_migration: plan !== "self_serve" && rng.chance(0.15), public_reference: false,
  };
}

function acv(rng: Rng, plan: PricingPlan): number {
  const raw = rng.lognormal(ACV_MEDIAN[plan], plan === "enterprise" ? 0.7 : 0.45);
  const { min_acv = 1_200, max_acv = Infinity } = program.pricing_plans[plan];
  return Math.round(Math.min(max_acv - 100, Math.max(min_acv, raw)) / 100) * 100;
}

function shapeForward(ctx: Ctx, opp: Opportunity, winRate: number, until: number): void {
  const { rng } = ctx;
  const cycle = rng.between(...CYCLE_DAYS[opp.pricing_plan]) * DAY;
  const close = opp.created_at + cycle;
  if (close <= Math.min(AS_OF, until)) {
    if (rng.chance(winRate)) {
      const goLive = startOfDay(close + rng.between(...GO_LIVE_DAYS[opp.pricing_plan]) * DAY);
      closeWon(opp, close, goLive <= AS_OF ? goLive : null);
    } else {
      loseInstead(opp, close);
    }
    return;
  }
  const progress = Math.max(0, (AS_OF - opp.created_at) / cycle);
  opp.stage = progress < 0.25 ? "prospecting" : progress < 0.5 ? "qualification" : progress < 0.75 ? "proposal" : "negotiation";
}

function closeWon(opp: Opportunity, close: number, goLive: number | null): void {
  opp.stage = "closed_won";
  opp.closed_at = close;
  opp.won = true;
  opp.go_live_at = goLive === null ? null : startOfDay(goLive);
}

function loseInstead(opp: Opportunity, close = opp.closed_at ?? opp.created_at + 30 * DAY): void {
  opp.stage = "closed_lost";
  opp.closed_at = Math.min(close, AS_OF);
  opp.won = false;
  opp.go_live_at = null;
  opp.public_reference = false;
}

function maybeReference(rng: Rng, opp: Opportunity): void {
  // A live customer agrees to be a public reference now and then (decision 33).
  if (opp.go_live_at !== null && rng.chance(opp.pricing_plan === "enterprise" ? 0.5 : 0.3)) opp.public_reference = true;
}

/** A sourced deal starts with an approved registration or a referral (attribution.yaml). */
function sourcedSignals(ctx: Ctx, p: Partner, opp: Opportunity, signalAt: number, viaRegistration: boolean): void {
  const { rng } = ctx;
  const at = Math.min(signalAt, opp.created_at - HOUR);
  if (viaRegistration) {
    const responded = Math.min(at + responseHours(rng) * HOUR, opp.created_at - HOUR / 2);
    ctx.out.dealRegistrations.push(registration(rng, {
      partner_id: p.id, account_id: opp.account_id, opportunity_id: opp.id, submitted_at: at,
      amount: Math.round((opp.amount * rng.between(0.8, 1.2)) / 100) * 100, status: "approved", reason: null,
      responded_at: Math.max(responded, at + HOUR / 4),
    }));
  } else {
    addTouch(ctx, opp, p.id, "referral", at);
  }
  addRole(ctx, opp, p.id, "sourced", opp.created_at);
  if (rng.chance(0.4)) addTouch(ctx, opp, p.id, "co_sell", midDeal(rng, opp));
  if (opp.won && opp.pricing_plan !== "self_serve" && rng.chance(0.75)) {
    const implAt = opp.closed_at! + rng.between(2, 12) * DAY;
    if (implAt <= Math.min(AS_OF, p.activeUntil)) addTouch(ctx, opp, p.id, "implementation", implAt);
  }
}

/** Fills in the fields every registration shares. Ids are assigned later. */
export function registration(
  rng: Rng,
  fields: Omit<DealRegistration, "id" | "product" | "sla_due_at"> & { product?: Product },
): DealRegistration {
  return {
    id: "",
    product: fields.product ?? (rng.pick(program.deal_registration.products) as Product),
    sla_due_at: addBusinessDays(fields.submitted_at, program.deal_registration.sla_business_days),
    ...fields,
  };
}

/** Most answers land inside 2 business days; a few breach it. */
export const responseHours = (rng: Rng): number => Math.max(0.5, rng.lognormal(16, 0.8));

function addTouch(ctx: Ctx, opp: Opportunity, partnerId: string, type: TouchType, at: number): void {
  if (at > AS_OF) return;
  ctx.out.touches.push({ id: "", opportunity_id: opp.id, partner_id: partnerId, touch_type: type, touched_at: at });
}

function addRole(ctx: Ctx, opp: Opportunity, partnerId: string, role: PartnerRole, at: number): void {
  const key = `${partnerId}|${role}`;
  const seen = ctx.roles.get(opp.id) ?? new Set<string>();
  if (seen.has(key)) return;
  seen.add(key);
  ctx.roles.set(opp.id, seen);
  ctx.out.roster.push({ opportunity_id: opp.id, partner_id: partnerId, role, added_at: Math.min(at, AS_OF) });
}

const midDeal = (rng: Rng, opp: Opportunity): number =>
  opp.created_at + rng.between(0.1, 0.8) * ((opp.closed_at ?? AS_OF) - opp.created_at);

/** A partner signed and still active at this moment, chosen by productivity. */
function activePartner(ctx: Ctx, at: number, ok: (p: Partner) => boolean): Partner | null {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const p = pickByWeight(ctx)(ctx.rng);
    if (p.terms_accepted_at <= at && at <= p.activeUntil && ok(p)) return p;
  }
  return null;
}

let samplerCache: { partners: Partner[]; draw: (rng: Rng) => Partner } | null = null;
function pickByWeight(ctx: Ctx): (rng: Rng) => Partner {
  if (samplerCache?.partners !== ctx.partners) {
    samplerCache = { partners: ctx.partners, draw: createSampler(ctx.partners, ctx.partners.map((p) => Math.sqrt(p.weight))) };
  }
  return samplerCache.draw;
}

function pickAccount(ctx: Ctx, plan: PricingPlan): Account {
  // Enterprise plans land on bigger companies; self-serve on smaller ones.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const a = ctx.rng.pick(ctx.accounts);
    if (plan === "enterprise" && a.segment === "smb") continue;
    if (plan === "self_serve" && a.segment === "enterprise") continue;
    return a;
  }
  return ctx.rng.pick(ctx.accounts);
}

// ---------------------------------------------------------------------------
// Registrations that never became an opportunity

function backgroundRegistrations(ctx: Ctx): void {
  const { rng } = ctx;
  const { protection_days } = program.deal_registration;
  const kinds: [count: number, from: number, to: number, build: (at: number) => Partial<DealRegistration>][] = [
    [520, WINDOW_START, AS_OF - 7 * DAY, (at) => ({
      status: "rejected",
      reason: rng.pick(["incomplete_information", "customer_not_eligible", "existing_customer_relationship"]),
      responded_at: at + responseHours(rng) * HOUR,
    })],
    // Approved, but no opportunity inside the protection window, so it lapsed.
    [220, WINDOW_START, AS_OF - (protection_days + 1) * DAY, (at) => ({
      status: "expired", reason: "protection_window_lapsed", responded_at: at + responseHours(rng) * HOUR,
    })],
    // Approved recently and still inside the protection window.
    [160, AS_OF - (protection_days - 5) * DAY, AS_OF - 7 * DAY, (at) => ({
      status: "approved", reason: null, responded_at: at + responseHours(rng) * HOUR,
    })],
    // Waiting on an answer. Some are already past the SLA.
    [70, AS_OF - 6 * DAY, AS_OF - HOUR, () => ({ status: "pending", reason: null, responded_at: null })],
  ];
  for (const [count, from, to, build] of kinds) {
    for (let i = 0; i < count; i += 1) {
      const at = rng.between(from, to);
      const partner = activePartner(ctx, at, () => true);
      if (!partner) continue;
      const account = rng.pick(ctx.accounts);
      const extra = build(at);
      ctx.out.dealRegistrations.push(registration(rng, {
        partner_id: partner.id, account_id: account.id, opportunity_id: null, submitted_at: at,
        amount: Math.round(rng.lognormal(ACV_MEDIAN.premium, 0.8) / 100) * 100,
        status: extra.status!, reason: extra.reason ?? null, responded_at: extra.responded_at ?? null,
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// Ids

/**
 * Opportunity ids run in creation order. Deals were built with temporary ids
 * (some backwards from a go-live date), so sort them, hand out real ids, and
 * rewrite every reference. Rows referencing a deal that was dropped go too.
 */
function assignIds(out: Pipeline): void {
  out.opportunities.sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  const real = new Map<string, string>();
  out.opportunities.forEach((o, i) => {
    real.set(o.id, id("O", i + 1, 6));
    o.id = real.get(o.id)!;
  });
  out.touches = out.touches.filter((t) => real.has(t.opportunity_id));
  for (const t of out.touches) t.opportunity_id = real.get(t.opportunity_id)!;
  out.roster = out.roster.filter((r) => real.has(r.opportunity_id));
  for (const r of out.roster) r.opportunity_id = real.get(r.opportunity_id)!;
  out.dealRegistrations = out.dealRegistrations.filter((r) => r.opportunity_id === null || real.has(r.opportunity_id));
  for (const r of out.dealRegistrations) if (r.opportunity_id) r.opportunity_id = real.get(r.opportunity_id)!;
}

/** Deterministic sample without replacement. */
export function sample<T>(rng: Rng, items: T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return picked;
}

export const influenceWindow = attribution.influenced.window_days * DAY;
