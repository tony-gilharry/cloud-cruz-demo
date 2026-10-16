// The Ecosystem Partner Program guide, split into sections for retrieval.
// Built from the YAML config so the guide can never disagree with the data.
// Embeddings stay null until build 4 picks an embedding model.
import { attribution, program } from "../config.ts";
import type { ProgramDoc } from "../types.ts";

const TITLE = "Ecosystem Partner Program Guide";
const VERSION = "2026.2";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const list = (items: string[]) => items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export function generateProgramDocs(): ProgramDoc[] {
  const p = program;
  const c = p.commissions;
  const tiers = p.tiers.map((t) => {
    const needs = t.name === "Member"
      ? "a signed agreement and a named contact"
      : `${t.certified_people} certified people` +
        (t.level_2_plus ? ` (${t.level_2_plus} at Level 2 or above${t.level_3 ? `, ${t.level_3} at Level 3` : ""})` : "") +
        `, ${t.live_joint_customers} live joint customers, ${t.public_references} public reference${t.public_references > 1 ? "s" : ""}` +
        (t.sourced_revenue ? `, ${money(t.sourced_revenue)} in partner-sourced revenue over 12 months` : "") +
        ` and ${t.contribution_points} contribution points per half-year`;
    return `${t.name}: ${needs}. Commission ${pct(t.commission_rate)}. ${t.free_exams_per_year} free exams a year.` +
      (t.invite_only ? " By invitation only, with a joint business plan and an executive sponsor." : "");
  });
  const bands = p.implementation_package.bands.map((b) =>
    `${money(b.min_acv)} ACV and up: ${b.consulting_hours} consulting hours and ${b.technical_hours} hands-on hours ` +
    `(${money(b.consulting_hours * p.implementation_package.consulting_rate + b.technical_hours * p.implementation_package.technical_rate)})`);
  const w = attribution.influenced.touch_weights;

  const sections: [string, string][] = [
    ["Overview",
      "The Ecosystem Partner Program works with agencies, systems integrators (SIs), independent software vendors (ISVs), " +
      "technology partners and resellers that help customers go live on Cloud Cruz faster and for less than they could alone. " +
      "Partners climb four tiers by proving capability and customer outcomes. Every rule in this guide holds for " +
      `${p.reviews.rules_hold_months} months, with one mid-year adjustment window announced 90 days ahead.`],
    ["Tiers and requirements",
      `There are four tiers. ${tiers.join(" ")} A certified person holds an active credential and has used the product in the last ` +
      `${p.credentials.product_use_days} days. A partner is promoted within ${p.reviews.promotion_within_days} days of meeting a tier's criteria, checked on the ` +
      `1st of each month; demotions happen only at the July 1 review with ${p.reviews.demotion_notice_days} days' notice. Every partner sees a live ` +
      "scorecard of its numbers against these criteria."],
    ["How partners earn",
      `Partners earn a commission at their tier's rate on revenue from deals they sourced, and ${pct(c.marketplace_partner_of_record_rate)} as partner of record on ` +
      "cloud marketplace deals. A commission is earned only when the customer's invoice is paid, then held " +
      `${c.hold_days} days and released on the next payout run on the ${c.payout_day_of_month}th of the month. Monthly plans earn on each paid invoice; ` +
      `annual plans earn as each quarterly invoice is paid. The rate at close holds for the deal's term of ${c.term_months} months from go-live, ` +
      `and a demotion never cuts pay on customers a partner already landed. If a customer refunds within ${c.clawback_days} days, the commission reverses. ` +
      "Influenced deals count toward tier and attributed revenue but do not pay a commission. Instead, a partner that helped close an " +
      "Enterprise deal gets first offer on the implementation, and the implementation package covers its first hours."],
    ["SPIFFs",
      `SPIFFs reward the moments that matter, from ${c.spiffs.effective}: ${money(c.spiffs.first_customer_live)} for a partner's first live customer, ` +
      `${money(c.spiffs.first_enterprise_live)} for its first Enterprise go-live, and ${money(c.spiffs.retained_12_months)} for each customer still live after 12 months. ` +
      "SPIFFs follow the same hold and payout run as commissions."],
    ["Implementation package",
      "Cloud Cruz pays for a partner's first hours on an Enterprise deal it sourced, implemented or helped close, so partners can win business on Cloud Cruz over other platforms. " +
      `Bands: ${bands.join("; ")}. Consulting is paid at up to ${money(p.implementation_package.consulting_rate)} an hour and hands-on work at ` +
      `${money(p.implementation_package.technical_rate)}. At least one Level 2 technical person must be on the deal; during the beta, Cloud Cruz's ` +
      "partner solutions architect stands in."],
    ["Co-marketing fund",
      `${list(p.co_marketing.tiers)} partners can apply for co-marketing campaigns of ${list(p.co_marketing.campaign_sizes.map(money))}. ` +
      "Send a short plan; Cloud Cruz approves it and pays against proof of performance. Elite partners also get specialized campaigns."],
    ["Contribution points",
      `Partners earn points for approved contributions: a community answer ${p.contributions.points.community_answer}, a LinkedIn post ` +
      `${p.contributions.points.linkedin_post}, a published article that follows the Cloud Cruz language guide ${p.contributions.points.article}. ` +
      "Partner marketing approves each contribution before it counts. Points count toward tier and raise a partner's rank in the partner directory."],
    ["Credentials and exams",
      "Credentials prove customer results, not attendance. Sales and Technical Accreditations come with onboarding and never expire. " +
      `Level 1, 2 and 3 exams are proctored by Pearson VUE and cost ${money(p.exams.fees.level_1)}, ${money(p.exams.fees.level_2)} and ` +
      `${money(p.exams.fees.level_3)}; each tier's free exams cover them, and the pool resets every April 1. Levels last ` +
      `${p.credentials.level_valid_days} days. Badges are issued through ${p.credentials.issuer}.`],
    ["Deal registration",
      `Register opportunities in the partner portal before engaging the customer. Cloud Cruz answers within ${p.deal_registration.sla_business_days} ` +
      `business days. An approved registration protects the partner for ${p.deal_registration.protection_days} days. If no opportunity is created in ` +
      `that time, the registration expires and the partner may register again. Products: ${list(p.deal_registration.products)}.`],
    ["Rules of engagement",
      "The AE owns the customer relationship and gets full quota credit on partner deals in their territory; the partner account manager owns the " +
      "partner relationship. When a direct opportunity is already open on an account, a new partner registration is rejected with the reason " +
      "existing_direct_opportunity unless the AE invites the partner to co-sell. When two partners register the same account and product within " +
      "30 days, the earlier approved registration wins. A deal can have more than one partner: one may source it and another implement it."],
    ["Attribution",
      `A deal is partner-sourced when it comes from an approved deal registration or a partner referral made no more than ` +
      `${attribution.sourced.max_days_before_opportunity} days before the opportunity was created. A deal is partner-influenced when a partner ` +
      `touches it within ${attribution.influenced.window_days} days before close. Influence credit is split by touch weight: referral ${w.referral}, ` +
      `co-sell ${w.co_sell}, implementation ${w.implementation}, influence ${w.influence}.`],
    ["Onboarding",
      `Onboarding is done when a partner has three named contacts, payout details, Slack connected, a sandbox account, both accreditations and a ` +
      `kickoff. Builders have ${p.onboarding.ceiling_days.builder} days, Specialists ${p.onboarding.ceiling_days.specialist}, Scale and Anchor ` +
      `${p.onboarding.ceiling_days.scale}. A daily health check compares each partner with its own plan and flags anyone falling behind within days.`],
    ["Active partners",
      `A partner is active when it has sold, influenced or supported a customer in the last ${attribution.active_partner.window_days} days. ` +
      "Portal logins, webinars, cohort sessions and messages show engagement but do not make a partner active on their own. After " +
      `${p.inactivity.reactivation_days} days without activity a partner gets a re-activation offer, and after ${p.inactivity.alumni_days} days it ` +
      "moves to the alumni list. Earned commissions are always paid."],
    ["Support",
      "Ask the Support Hub first: it answers from this guide with citations. Questions it cannot answer open a Zendesk ticket, and urgent issues " +
      "go to a person in Slack."],
  ];

  return sections.map(([section, body], i) => ({
    id: `DOC${String(i + 1).padStart(2, "0")}`, title: TITLE, version: VERSION, section, body,
  }));
}
