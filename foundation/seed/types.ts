// Row shapes for every table, mirroring 001_schema.sql. Times are epoch
// milliseconds while generating and become ISO strings or dates at insert.

export type PartnerType = "agency" | "SI" | "ISV" | "tech" | "reseller";
export type PartnerSegment = "anchor" | "scale" | "specialist" | "builder";
export type Tier = "Member" | "Select" | "Premier" | "Elite";
export type Region = "us" | "canada" | "latam" | "uk_ireland" | "anz";
export type Temperature = "nurture" | "warm" | "hot" | "urgent";
export type Health = "cold" | "warm" | "hot";
export type OnboardingPlan = "standard_30" | "accelerated" | "automated";
export type Segment = "smb" | "midmarket" | "enterprise";
export type PricingPlan = "self_serve" | "premium" | "enterprise";
export type Source = "partner_sourced" | "direct" | "marketplace";
export type Marketplace = "aws" | "gcp" | "azure";
export type PartnerRole = "sourced" | "influenced" | "implementer" | "partner_of_record";
export type TouchType = "referral" | "co_sell" | "implementation" | "influence";
export type Product = "warehouse" | "pipelines" | "agents" | "governance";
export type DealRegStatus = "pending" | "approved" | "rejected" | "expired";
export type CredentialStep = "sales_accreditation" | "technical_accreditation" | "level_1" | "level_2" | "level_3";
export type Track = "technical" | "business";
export type Intervention = "none" | "nudge" | "outreach" | "person" | "office_hours" | "fast_track";

export interface TeamMember {
  id: string;
  name: string;
  role: "head_of_partner_ops" | "pdr" | "partner_manager" | "partner_account_manager"
    | "partner_solutions_architect" | "enablement" | "partner_operations" | "partner_marketing";
}

export interface PartnerLead {
  id: string;
  company: string;
  type: PartnerType;
  segment: PartnerSegment;
  region: Region;
  motion: "inbound" | "outbound";
  owner_id: string;
  created_at: number;
  fit_score: number;
  intent_application: number;
  intent_meeting: number;
  intent_timeline: number;
  intent_events: number;
  intent_content: number;
  intent_score: number;
  last_signal_at: number;
  deal_in_hand: boolean;
  temperature: Temperature;
  route: "person" | "agent_draft" | "nurture";
  stated_timeline: "now" | "this_quarter" | "later" | null;
  judgment_confidence: number | null;
  judgment_model: string | null;
  judged_at: number | null;
  human_review: boolean;
  audited: boolean;
  meeting_at: number | null;
  handoff_at: number | null;
  outcome: "open" | "converted" | "nurture" | "disqualified";
}

export interface Partner {
  id: string;
  name: string;
  lead_id: string;
  type: PartnerType;
  segment: PartnerSegment;
  path: "services" | "technology";
  region: Region;
  beta: boolean;
  fit_score: number;
  fit_outcome: "auto_approved" | "human_review";
  review_reason: string | null;
  applied_at: number;
  accepted_at: number;
  agreement_path: "click_through" | "procurement";
  terms_accepted_at: number;
  onboarding_plan: OnboardingPlan;
  partner_manager_id: string;
  partner_account_manager_id: string | null;
  onboarded_at: number | null;
  first_deal_registration_at: number | null;
  first_closed_won_at: number | null;
  first_live_customer_at: number | null;
  activation_rating: Health | null;
  tier: Tier;
  elite_invited: boolean;
  status: "active" | "alumni";
  alumni_at: number | null;
  delivery_maturity: number;
  avg_project_value: number;
  // Generator-only fields below. Never inserted.
  weight: number;            // Pareto productivity
  activeUntil: number;       // last moment this partner may sell, influence or support
  keepsEngaging: boolean;    // stale partners who still log in
  planned_live_at: number | null; // when its first joint customer goes live, if ever
  dealInHand: boolean;
}

export interface Person {
  id: string;
  partner_id: string;
  name: string;
  role: "executive_sponsor" | "technical_lead" | "sales_lead" | "technical" | "business";
  added_at: number;
}

export interface OnboardingSignal {
  partner_id: string;
  day: number;
  day_number: number;
  logged_in: boolean;
  checklist_pct: number;
  plan_pct: number;
  accreditations: number;
  sandbox_builds: number;
  cohort_sessions: number;
  slack_active: boolean;
  crossbeam_overlaps: number;
  deal_registered: boolean;
  health: Health;
  intervention: Intervention;
}

export interface Account {
  id: string;
  name: string;
  segment: Segment;
  region: Region;
  employees: number;
  owner: string;
}

export interface Opportunity {
  id: string;
  account_id: string;
  pricing_plan: PricingPlan;
  amount: number;
  term_months: number;
  stage: string;
  created_at: number;
  closed_at: number | null;
  won: boolean | null;
  go_live_at: number | null;
  source: Source;
  sourcing_partner_id: string | null;
  marketplace: Marketplace | null;
  competitive_migration: boolean;
  public_reference: boolean;
}

export interface OpportunityPartner {
  opportunity_id: string;
  partner_id: string;
  role: PartnerRole;
  added_at: number;
}

export interface DealRegistration {
  id: string;
  partner_id: string;
  account_id: string;
  opportunity_id: string | null;
  submitted_at: number;
  amount: number;
  product: Product;
  status: DealRegStatus;
  reason: string | null;
  sla_due_at: number;
  responded_at: number | null;
}

export interface Touch {
  id: string;
  opportunity_id: string;
  partner_id: string;
  touch_type: TouchType;
  touched_at: number;
}

export interface Invoice {
  id: string;
  opportunity_id: string;
  account_id: string;
  period_start: number;
  amount: number;
  issued_at: number;
  paid_at: number | null;
  refunded_at: number | null;
}

export interface Credential {
  id: string;
  person_id: string;
  partner_id: string;
  step: CredentialStep;
  track: Track | null;
  issuer: string;
  issued_at: number;
  expires_at: number | null;
  last_product_use_at: number | null;
}

export interface ExamAttempt {
  id: string;
  person_id: string;
  partner_id: string;
  step: "level_1" | "level_2" | "level_3";
  track: Track;
  attempted_at: number;
  fee: number;
  passed: boolean;
  paid_by: "voucher" | "partner";
  voucher_source: "tier" | "accelerated_plan" | "anchor" | null;
}

export interface TierChange {
  id: string;
  partner_id: string;
  tier: Tier;
  reason: "signed" | "promoted" | "label";
  changed_at: number;
}

export interface CommissionAccrual {
  id: string;
  partner_id: string;
  opportunity_id: string;
  role: PartnerRole;
  invoice_id: string | null;
  mechanism: "per_invoice" | "annualized" | "spiff";
  spiff_trigger: "first_customer_live" | "first_enterprise_live" | "retained_12_months" | null;
  rate: number | null;
  amount: number;
  status: "earned" | "held" | "released" | "reversed";
  earned_at: number;
  hold_until: number;
  released_at: number | null;
  reversed_at: number | null;
}

export interface ImplementationPackage {
  id: string;
  opportunity_id: string;
  partner_id: string;
  credential_id: string | null;
  band: "50k_150k" | "150k_500k" | "500k_plus";
  consulting_hours: number;
  technical_hours: number;
  consulting_rate: number;
  technical_rate: number;
  amount: number;
  beta: boolean;
  psa_stand_in: boolean;
  approved_at: number;
  paid_at: number | null;
}

export interface CoMarketingCampaign {
  id: string;
  partner_id: string;
  size: number;
  status: "submitted" | "approved" | "rejected" | "paid";
  submitted_at: number;
  approved_at: number | null;
  proof_at: number | null;
  paid_at: number | null;
}

export interface ProgramCost {
  period: number;
  category: "headcount" | "commissions" | "implementation_packages" | "co_marketing" | "exam_vouchers" | "tools";
  amount: number;
}

export interface Contribution {
  id: string;
  partner_id: string;
  person_id: string;
  type: "community_answer" | "linkedin_post" | "article";
  submitted_at: number;
  status: "pending" | "approved" | "rejected";
  reviewed_at: number | null;
  points: number;
}

export interface SupportTicket {
  id: string;
  partner_id: string;
  account_id: string | null;
  category: "onboarding" | "deal_registration" | "technical" | "commissions" | "credentials" | "billing";
  channel: "support_hub" | "zendesk" | "slack";
  opened_at: number;
  resolved_at: number | null;
  answered_by_hub: boolean;
  sla_met: boolean | null;
}

export interface EngagementEvent {
  id: string;
  partner_id: string;
  event: "portal_login" | "cohort_session" | "webinar" | "course" | "slack_message" | "introw_message" | "email";
  occurred_at: number;
}

export interface ProgramDoc {
  id: string;
  title: string;
  version: string;
  section: string;
  body: string;
}

export interface EvalTag {
  entity_type: string;
  entity_id: string;
  tag: string;
  note: string;
}

export interface Dataset {
  team: TeamMember[];
  leads: PartnerLead[];
  partners: Partner[];
  people: Person[];
  onboardingSignals: OnboardingSignal[];
  accounts: Account[];
  opportunities: Opportunity[];
  opportunityPartners: OpportunityPartner[];
  dealRegistrations: DealRegistration[];
  touches: Touch[];
  invoices: Invoice[];
  credentials: Credential[];
  examAttempts: ExamAttempt[];
  tierHistory: TierChange[];
  accruals: CommissionAccrual[];
  packages: ImplementationPackage[];
  campaigns: CoMarketingCampaign[];
  programCosts: ProgramCost[];
  contributions: Contribution[];
  tickets: SupportTicket[];
  engagementEvents: EngagementEvent[];
  programDocs: ProgramDoc[];
  evalTags: EvalTag[];
}
