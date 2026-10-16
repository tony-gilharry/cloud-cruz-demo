// Exports the Salesforce sample (decision 62): the 25 beta design partners
// plus 25 launch partners across the four segments, with their customers,
// deals, roles, registrations, credentials, accruals, packages and touches,
// as `sf data import tree` files. Built from the same seeded generator as the
// database, so it needs no database connection and no secrets.
//
// Run from the repo root:  node blueprint/salesforce/scripts/export-sample.ts
// Then load:               sf data import tree --plan blueprint/salesforce/data/plan.json --target-org cloud-cruz
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AS_OF, DAY } from "../../../foundation/seed/config.ts";
import { generateDataset } from "../../../foundation/seed/index.ts";
import { LIVE_ROLES } from "../../../foundation/seed/generate/milestones.ts";
import { personName } from "../../../foundation/seed/names.ts";
import { createRng } from "../../../foundation/seed/rng.ts";
import { scorecard, tierInputs } from "../../../foundation/seed/generate/tiers.ts";
import type { Dataset, Partner } from "../../../foundation/seed/types.ts";

const OUT = fileURLToPath(new URL("../data/", import.meta.url));
const LAUNCH_SAMPLE: Record<Partner["segment"], number> = { anchor: 3, scale: 5, specialist: 9, builder: 8 };
// Developer Edition has 5 MB of data storage (about 2,500 records), so each
// partner's slice is capped. Live customers and named contacts come first.
const OPEN_LEADS = 40;
const TOUCHES_PER_PARTNER = 2;
const DEALS_PER_PARTNER = 6;
const PEOPLE_PER_PARTNER = 5;
const OPEN_REGISTRATIONS_PER_PARTNER = 1;
const PER_FILE = 200;                 // sf data import tree limit per request

type SfRecord = { attributes: { type: string; referenceId: string } } & Record<string, unknown>;

const day = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const ref = (id: string) => `@${id.replace(/[^A-Za-z0-9]/g, "")}`;
const rec = (type: string, refId: string, fields: Record<string, unknown>): SfRecord =>
  ({ attributes: { type, referenceId: refId.replace(/[^A-Za-z0-9]/g, "") }, ...dropNulls(fields) });

function main(): void {
  const { data } = generateDataset();
  const recordTypes = accountRecordTypes();
  const sample = pickSample(data);
  const ids = new Set(sample.map((p) => p.id));
  const opps = new Map(data.opportunities.map((o) => [o.id, o]));

  // Each partner's deals, live customers first, unless sourced by a partner outside the sample.
  const rosterBySample = data.opportunityPartners.filter((r) => ids.has(r.partner_id));
  const oppIds = new Set<string>();
  for (const p of sample) {
    const mine = [...new Set(rosterBySample.filter((r) => r.partner_id === p.id).map((r) => r.opportunity_id))]
      .map((oid) => opps.get(oid)!)
      .filter((o) => !o.sourcing_partner_id || ids.has(o.sourcing_partner_id))
      .sort((a, b) => Number(b.go_live_at !== null) - Number(a.go_live_at !== null) || b.created_at - a.created_at || a.id.localeCompare(b.id));
    for (const o of mine.slice(0, DEALS_PER_PARTNER)) oppIds.add(o.id);
  }
  // Registrations behind those deals, plus each partner's most recent open one.
  const regs = data.dealRegistrations.filter((r) => ids.has(r.partner_id) && r.opportunity_id !== null && oppIds.has(r.opportunity_id));
  for (const p of sample) {
    const unconverted = data.dealRegistrations.filter((r) => r.partner_id === p.id && r.opportunity_id === null)
      .sort((a, b) => b.submitted_at - a.submitted_at).slice(0, OPEN_REGISTRATIONS_PER_PARTNER);
    regs.push(...unconverted);
  }
  const customerIds = new Set([...[...oppIds].map((oid) => opps.get(oid)!.account_id), ...regs.map((r) => r.account_id)]);

  const inputs = tierInputs(data.credentials, data.opportunities, data.opportunityPartners, data.contributions);
  const out: Record<string, SfRecord[]> = {};
  const push = (type: string, r: SfRecord) => (out[type] ??= []).push(r);

  for (const p of sample) push("Account", partnerAccount(p, data, inputs, recordTypes.Partner));
  for (const a of data.accounts.filter((x) => customerIds.has(x.id))) {
    push("Account", rec("Account", a.id, {
      Name: a.name, RecordTypeId: recordTypes.Customer, NumberOfEmployees: a.employees,
      Description: `Synthetic Cloud Cruz customer. Segment: ${a.segment}. Region: ${a.region}. AE: ${a.owner}.`,
    }));
  }

  // The three named contacts, then the people holding the most credentials.
  const credCount = new Map<string, number>();
  for (const c of data.credentials) credCount.set(c.person_id, (credCount.get(c.person_id) ?? 0) + 1);
  const named = new Set(["executive_sponsor", "technical_lead", "sales_lead"]);
  const people = sample.flatMap((p) => data.people.filter((x) => x.partner_id === p.id)
    .sort((a, b) => Number(named.has(b.role)) - Number(named.has(a.role)) || (credCount.get(b.id) ?? 0) - (credCount.get(a.id) ?? 0) || a.id.localeCompare(b.id))
    .slice(0, PEOPLE_PER_PARTNER));
  const peopleIds = new Set(people.map((x) => x.id));
  for (const x of people) {
    const [first, ...rest] = x.name.split(" ");
    push("Contact", rec("Contact", x.id, { FirstName: first, LastName: rest.join(" ") || first, AccountId: ref(x.partner_id), Title: TITLES[x.role] }));
  }

  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  for (const oid of oppIds) {
    const o = opps.get(oid)!;
    push("Opportunity", rec("Opportunity", o.id, {
      Name: `${accounts.get(o.account_id)!.name} ${PLAN[o.pricing_plan]}`, AccountId: ref(o.account_id),
      StageName: STAGE[o.stage], CloseDate: day(o.closed_at ?? AS_OF + 30 * DAY), Amount: o.amount,
      Pricing_Plan__c: PLAN[o.pricing_plan], Deal_Source__c: SOURCE[o.source],
      Sourcing_Partner__c: o.sourcing_partner_id ? ref(o.sourcing_partner_id) : null,
      Marketplace__c: o.marketplace ? MARKETPLACE[o.marketplace] : null, ACV__c: o.amount, Term_Months__c: o.term_months,
      Competitive_Migration__c: o.competitive_migration, Go_Live_On__c: day(o.go_live_at),
    }));
  }

  const roleRef = (oid: string, pid: string, role: string) => `OP${oid}${pid}${role}`;
  const roster = rosterBySample.filter((r) => oppIds.has(r.opportunity_id));
  for (const r of roster) {
    push("Opportunity_Partner__c", rec("Opportunity_Partner__c", roleRef(r.opportunity_id, r.partner_id, r.role), {
      Opportunity__c: ref(r.opportunity_id), Partner__c: ref(r.partner_id), Role__c: ROLE[r.role],
    }));
  }

  for (const r of regs) {
    push("Deal_Registration__c", rec("Deal_Registration__c", r.id, {
      Partner__c: ref(r.partner_id), Customer_Account__c: ref(r.account_id),
      Opportunity__c: r.opportunity_id && oppIds.has(r.opportunity_id) ? ref(r.opportunity_id) : null,
      Status__c: REG_STATUS[r.status], Submitted_On__c: day(r.submitted_at), Answered_On__c: day(r.responded_at),
      Rejection_Reason__c: r.reason,
    }));
  }

  const creds = data.credentials.filter((c) => peopleIds.has(c.person_id));
  for (const c of creds) {
    push("Credential__c", rec("Credential__c", c.id, {
      Contact__c: ref(c.person_id), Partner__c: ref(c.partner_id), Step__c: STEP[c.step],
      Track__c: c.track ? cap(c.track) : null, Issuer__c: "Credly", Issued_On__c: day(c.issued_at),
      Expires_On__c: day(c.expires_at), Last_Product_Use_On__c: day(c.last_product_use_at),
    }));
  }

  // Rows that break a program rule cannot be entered: the validation rules
  // reject them. Counted here so 08 can say so.
  const rosterKeys = new Set(roster.map((r) => roleRef(r.opportunity_id, r.partner_id, r.role)));
  const blocked = { earlyReleases: 0, packagesWithoutL2: 0 };
  for (const a of data.accruals.filter((x) => ids.has(x.partner_id) && oppIds.has(x.opportunity_id))) {
    const key = roleRef(a.opportunity_id, a.partner_id, a.role);
    if (!rosterKeys.has(key)) continue;
    if (a.released_at !== null && a.released_at < a.hold_until) { blocked.earlyReleases += 1; continue; }
    push("Commission_Accrual__c", rec("Commission_Accrual__c", a.id, {
      Partner__c: ref(a.partner_id), Opportunity__c: ref(a.opportunity_id), Opportunity_Partner__c: ref(key),
      Mechanism__c: MECHANISM[a.mechanism], SPIFF_Trigger__c: a.spiff_trigger ? SPIFF[a.spiff_trigger] : null,
      Invoice_Number__c: a.invoice_id, Invoice_Paid_On__c: day(a.earned_at), Rate__c: a.rate === null ? null : Math.round(a.rate * 10000) / 100,
      Amount__c: a.amount, Status__c: cap(a.status), Released_On__c: day(a.released_at),
    }));
  }
  const credIds = new Set(creds.map((c) => c.id));
  for (const k of data.packages.filter((x) => ids.has(x.partner_id) && oppIds.has(x.opportunity_id))) {
    if (!k.psa_stand_in && (k.credential_id === null || !credIds.has(k.credential_id))) { blocked.packagesWithoutL2 += 1; continue; }
    push("Implementation_Package__c", rec("Implementation_Package__c", k.id, {
      Opportunity__c: ref(k.opportunity_id), Partner__c: ref(k.partner_id),
      L2_Credential__c: k.credential_id ? ref(k.credential_id) : null, PSA_Stand_In__c: k.psa_stand_in, Band__c: BAND[k.band],
      Consulting_Hours__c: k.consulting_hours, Technical_Hours__c: k.technical_hours,
      Consulting_Rate__c: k.consulting_rate, Technical_Rate__c: k.technical_rate,
      Approved_On__c: day(k.approved_at), Paid_On__c: day(k.paid_at),
    }));
  }

  for (const p of sample) {
    const recent = data.engagementEvents.filter((e) => e.partner_id === p.id && CHANNEL[e.event] && e.occurred_at > AS_OF - 90 * DAY);
    for (const e of recent.slice(-TOUCHES_PER_PARTNER)) {
      push("Partner_Touch__c", rec("Partner_Touch__c", e.id, {
        Partner__c: ref(p.id), Channel__c: CHANNEL[e.event], Occurred_On__c: iso(e.occurred_at), Summary__c: SUMMARY[e.event],
      }));
    }
  }

  // Stage 0: the open leads, highest fit x intent first (Who to call today).
  const rng = createRng(62);
  const open = data.leads.filter((l) => l.outcome === "open")
    .sort((a, b) => b.fit_score * b.intent_score - a.fit_score * a.intent_score || a.id.localeCompare(b.id)).slice(0, OPEN_LEADS);
  for (const l of open) {
    const [first, ...rest] = personName(rng).split(" ");
    push("Lead", rec("Lead", l.id, {
      FirstName: first, LastName: rest.join(" "), Company: l.company, Status: l.meeting_at ? "Working - Contacted" : "Open - Not Contacted",
      Motion__c: cap(l.motion), Segment__c: cap(l.segment), Fit_Score__c: l.fit_score, Intent_Score__c: l.intent_score,
      Temperature__c: cap(l.temperature), Deal_In_Hand__c: l.deal_in_hand,
      Judgment_Value__c: l.stated_timeline, Judgment_Model__c: l.judgment_model, Judged_On__c: iso(l.judged_at),
    }));
  }

  writePlan(out);
  const total = Object.values(out).reduce((s, r) => s + r.length, 0);
  console.log(Object.entries(out).map(([t, r]) => `${t.padEnd(28)} ${r.length}`).join("\n"));
  console.log(`total ${total} records; blocked by validation rules: ${JSON.stringify(blocked)}`);
}

// ---------------------------------------------------------------------------

/** All 25 beta partners, then the most active launch partners per segment, plus some quiet ones. */
function pickSample(data: Dataset): Partner[] {
  const live = new Map<string, number>();
  const opps = new Map(data.opportunities.map((o) => [o.id, o]));
  for (const r of data.opportunityPartners) {
    if (LIVE_ROLES.has(r.role) && opps.get(r.opportunity_id)!.go_live_at !== null) live.set(r.partner_id, (live.get(r.partner_id) ?? 0) + 1);
  }
  const picked = data.partners.filter((p) => p.beta);
  for (const [segment, n] of Object.entries(LAUNCH_SAMPLE) as [Partner["segment"], number][]) {
    const pool = data.partners.filter((p) => !p.beta && p.segment === segment)
      .sort((a, b) => (live.get(b.id) ?? 0) - (live.get(a.id) ?? 0) || a.id.localeCompare(b.id));
    const active = Math.ceil(n * 0.7);
    const quiet = pool.filter((p) => !live.has(p.id)).slice(0, n - active);
    picked.push(...pool.slice(0, active), ...quiet);
  }
  return picked;
}

function partnerAccount(p: Partner, data: Dataset, inputs: ReturnType<typeof tierInputs>, recordTypeId: string): SfRecord {
  const card = scorecard(p.id, AS_OF, inputs);
  const h = health(p, data, card.certifiedPeople, card.liveJointCustomers);
  return rec("Account", p.id, {
    Name: p.name, RecordTypeId: recordTypeId, Type: "Partner",
    Description: `Synthetic Cloud Cruz partner (${p.type}, ${p.region}). Signed ${day(p.terms_accepted_at)}.`,
    Segment__c: cap(p.segment), Partner_Path__c: cap(p.path), Partner_Tier__c: p.tier, Elite_Invited__c: p.elite_invited,
    Beta_Design_Partner__c: p.beta, Partner_Status__c: cap(p.status), Fit_Score__c: p.fit_score,
    Lifecycle_Stage__c: !p.onboarded_at ? "Onboard" : !p.first_live_customer_at ? "Activate" : "Maintain",
    Onboarding_Plan__c: PLAN_NAME[p.onboarding_plan], Terms_Accepted_On__c: day(p.terms_accepted_at), Onboarded_On__c: day(p.onboarded_at),
    First_Deal_Registration_On__c: day(p.first_deal_registration_at), First_Closed_Won_On__c: day(p.first_closed_won_at),
    First_Live_Customer_On__c: day(p.first_live_customer_at), Activation_Rating__c: p.activation_rating ? cap(p.activation_rating) : null,
    Health_Selling__c: h.selling, Health_Customers__c: h.customers, Health_Skills__c: h.skills, Health_Delivery__c: h.delivery,
    Certified_People__c: card.certifiedPeople, Live_Joint_Customers__c: card.liveJointCustomers,
    Public_References__c: card.publicReferences, Contribution_Points__c: card.contributionPoints,
  });
}

/** The four health questions (decision 54), answered from the data on the as-of date (Mar 31, 2028). */
function health(p: Partner, data: Dataset, certified: number, live: number) {
  const recent = (days: number) => AS_OF - days * DAY;
  const lastTouch = Math.max(0, ...data.touches.filter((t) => t.partner_id === p.id).map((t) => t.touched_at),
    ...data.dealRegistrations.filter((r) => r.partner_id === p.id).map((r) => r.submitted_at));
  const selling = lastTouch >= recent(90) ? "Green" : lastTouch >= recent(180) ? "Yellow" : "Red";
  const customers = live > 0 ? "Green" : p.terms_accepted_at >= recent(90) || p.first_closed_won_at ? "Yellow" : "Red";
  const skills = certified >= 2 ? "Green" : certified === 1 ? "Yellow" : "Red";
  const missed = data.tickets.filter((t) => t.partner_id === p.id && t.channel === "zendesk" && t.opened_at >= recent(90) && t.sla_met === false).length;
  const delivery = missed >= 3 ? "Red" : missed >= 1 ? "Yellow" : "Green";
  return { selling, customers, skills, delivery };
}

function accountRecordTypes(): Record<"Partner" | "Customer", string> {
  const raw = execFileSync("sf", ["data", "query", "--target-org", "cloud-cruz", "--json",
    "--query", "SELECT Id, DeveloperName FROM RecordType WHERE SobjectType = 'Account'"],
    { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });
  const rows = JSON.parse(raw.replace(/\x1b\[[0-9;]*m/g, "")).result.records as { Id: string; DeveloperName: string }[];
  const find = (name: string) => rows.find((r) => r.DeveloperName === name)?.Id ?? fail(`record type ${name} not found`);
  return { Partner: find("Partner"), Customer: find("Customer") };
}

/** One file per 200 records, in dependency order, with references resolved by the CLI. */
function writePlan(out: Record<string, SfRecord[]>): void {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const order = ["Account", "Contact", "Opportunity", "Opportunity_Partner__c", "Deal_Registration__c", "Credential__c",
    "Commission_Accrual__c", "Implementation_Package__c", "Partner_Touch__c", "Lead"];
  const plan = order.filter((t) => out[t]?.length).map((type) => {
    const files: string[] = [];
    for (let i = 0; i < out[type].length; i += PER_FILE) {
      const file = `${type}-${files.length + 1}.json`;
      writeFileSync(OUT + file, JSON.stringify({ records: out[type].slice(i, i + PER_FILE) }, null, 1) + "\n");
      files.push(file);
    }
    return { sobject: type, saveRefs: true, resolveRefs: true, files };
  });
  writeFileSync(OUT + "plan.json", JSON.stringify(plan, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Value maps: database enum to Salesforce picklist label

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
const TITLES = { executive_sponsor: "Executive sponsor", technical_lead: "Technical lead", sales_lead: "Sales lead", technical: "Technical", business: "Business" };
const PLAN = { self_serve: "Self-serve", premium: "Premium", enterprise: "Enterprise" };
const PLAN_NAME = { standard_30: "Standard 30-day", accelerated: "Accelerated", automated: "Automated" };
const SOURCE = { partner_sourced: "Sourced", direct: "Direct", marketplace: "Marketplace" };
const MARKETPLACE = { aws: "AWS", gcp: "Google Cloud", azure: "Azure" };
const STAGE: Record<string, string> = {
  prospecting: "Prospecting", qualification: "Qualification", proposal: "Proposal/Price Quote",
  negotiation: "Negotiation/Review", closed_won: "Closed Won", closed_lost: "Closed Lost",
};
const ROLE = { sourced: "Sourced", influenced: "Influenced", implementer: "Implementer", partner_of_record: "Partner of record" };
const REG_STATUS = { pending: "Submitted", approved: "Approved", rejected: "Rejected", expired: "Expired" };
const STEP = { sales_accreditation: "Sales Accreditation", technical_accreditation: "Technical Accreditation", level_1: "Level 1", level_2: "Level 2", level_3: "Level 3" };
const MECHANISM = { per_invoice: "Per invoice", annualized: "Annualized", spiff: "SPIFF" };
const SPIFF = { first_customer_live: "First customer live", first_enterprise_live: "First Enterprise go-live", retained_12_months: "Retained 12 months" };
const BAND = { "50k_150k": "$50K to $150K", "150k_500k": "$150K to $500K", "500k_plus": "$500K+" };
const CHANNEL: Record<string, string | undefined> = { slack_message: "Slack", introw_message: "introw", email: "Email" };
const SUMMARY: Record<string, string> = { slack_message: "Message in the partner Slack channel", introw_message: "Message in introw", email: "Email with the partner team" };

function dropNulls(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
}

function fail(message: string): never {
  throw new Error(message);
}

main();
