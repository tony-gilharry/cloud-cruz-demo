// Stage 4, Enable: the five-step credential ladder and the proctored exams
// behind Levels 1 to 3 (decisions 27, 47, 52, 53, 80, 81, 83).
//
// Accreditations come with onboarding. Levels are earned by proof: Level 2
// technical needs two customer go-lives, Level 3 technical needs Readiness
// Reviews on a larger book. Exam payment (voucher or partner) is settled
// later, once tiers are known, because the voucher pool depends on tier.
import { AS_OF, DAY, id, program, startOfDay } from "../config.ts";
import type { Rng } from "../rng.ts";
import type { Credential, ExamAttempt, Partner, Person, Track } from "../types.ts";
import type { Pace } from "./onboarding.ts";

const L1_UPTAKE = { activated: 0.7, other: 0.25 };
const PASS_RATE = { level_1: 0.75, level_2: 0.8, level_3: 0.7 };
const RETRY_RATE = 0.6;
const RECERTIFY_RATE = 0.6;
const STALE_USE_RATE = 0.2;         // people whose last product use is over 90 days old

export interface Enablement {
  credentials: Credential[];
  examAttempts: ExamAttempt[];
}

type Draft<T> = Omit<T, "id">;

export function generateCredentials(
  rng: Rng, partners: Partner[], people: Person[], paces: Map<string, Pace>,
  liveDates: Map<string, number[]>, wonDates: Map<string, number[]>,
): Enablement {
  const creds: Draft<Credential>[] = [];
  const attempts: Draft<ExamAttempt>[] = [];
  const byPartner = new Map<string, Person[]>();
  for (const person of people) byPartner.set(person.partner_id, [...(byPartner.get(person.partner_id) ?? []), person]);

  for (const p of partners) {
    const pace = paces.get(p.id)!;
    const team = byPartner.get(p.id) ?? [];
    const lastUse = (issued: number) => productUse(rng, issued, p);
    const accredit = (person: Person, step: "sales_accreditation" | "technical_accreditation", at: number) => {
      if (at > AS_OF || at > p.activeUntil) return;
      creds.push({ person_id: person.id, partner_id: p.id, step, track: null, issuer: program.credentials.issuer,
        issued_at: startOfDay(at), expires_at: null, last_product_use_at: lastUse(at) });
    };

    // Accreditations: the sales lead and technical lead during onboarding
    // (at 60% and 85% of the checklist, as the daily signals show), then others.
    const done = pace.completionDay;
    for (const person of team) {
      if (person.role === "sales_lead" && done) accredit(person, "sales_accreditation", p.terms_accepted_at + Math.round(done * 0.6) * DAY);
      if (person.role === "technical_lead" && done) accredit(person, "technical_accreditation", p.terms_accepted_at + Math.round(done * 0.85) * DAY);
      if (person.role === "executive_sponsor" && done && rng.chance(0.5)) accredit(person, "sales_accreditation", p.terms_accepted_at + Math.round(done * 0.9) * DAY);
      if ((person.role === "technical" || person.role === "business") && rng.chance(0.9)) {
        accredit(person, person.role === "technical" ? "technical_accreditation" : "sales_accreditation",
          Math.max(person.added_at, p.onboarded_at ?? p.terms_accepted_at) + rng.int(5, 45) * DAY);
      }
    }
    if (!p.onboarded_at) continue;

    // Level 1: everyone takes the business track; technical people add the technical one.
    const activated = (liveDates.get(p.id) ?? []).length > 0;
    for (const person of team) {
      if (person.role === "executive_sponsor" || !rng.chance(activated ? L1_UPTAKE.activated : L1_UPTAKE.other)) continue;
      const start = Math.max(person.added_at, p.onboarded_at) + rng.int(15, 90) * DAY;
      const tracks: Track[] = isTechnical(person) ? ["business", "technical"] : ["business"];
      tracks.forEach((track, i) => sitExam(rng, p, person, "level_1", track, start + i * rng.int(7, 30) * DAY, creds, attempts));
    }

    // Level 2: technical after two go-lives; business after two signed deals.
    const lives = liveDates.get(p.id) ?? [];
    const wins = wonDates.get(p.id) ?? [];
    const techLead = team.find((x) => x.role === "technical_lead");
    const salesLead = team.find((x) => x.role === "sales_lead");
    if (lives.length >= 2 && techLead) sitExam(rng, p, techLead, "level_2", "technical", lives[1] + rng.int(5, 30) * DAY, creds, attempts);
    if (lives.length >= 4) {
      const other = team.find((x) => x.role === "technical" && x.added_at < lives[3]);
      if (other) sitExam(rng, p, other, "level_2", "technical", lives[3] + rng.int(5, 30) * DAY, creds, attempts);
    }
    if (wins.length >= 2 && salesLead) sitExam(rng, p, salesLead, "level_2", "business", wins[1] + rng.int(90, 120) * DAY, creds, attempts);

    // Level 3: technical advisors run Readiness Reviews on a bigger book.
    if (lives.length >= 6 && techLead && rng.chance(0.5)) {
      sitExam(rng, p, techLead, "level_3", "technical", lives[5] + rng.int(20, 60) * DAY, creds, attempts);
    }
  }

  recertify(rng, partners, creds, attempts, byPersonId(people));
  return {
    credentials: creds.sort((a, b) => a.issued_at - b.issued_at || a.person_id.localeCompare(b.person_id))
      .map((c, i) => ({ id: id("CR", i + 1, 5), ...c })),
    examAttempts: attempts.sort((a, b) => a.attempted_at - b.attempted_at || a.person_id.localeCompare(b.person_id))
      .map((e, i) => ({ id: id("EX", i + 1, 5), ...e })),
  };
}

const isTechnical = (person: Person) => person.role === "technical" || person.role === "technical_lead";

/** One exam, with a retry on failure. A pass issues the credential. */
function sitExam(
  rng: Rng, p: Partner, person: Person, step: "level_1" | "level_2" | "level_3", track: Track, at: number,
  creds: Draft<Credential>[], attempts: Draft<ExamAttempt>[],
): void {
  let when = startOfDay(at);
  for (let tries = 0; tries < 2 && when <= AS_OF && when <= p.activeUntil; tries += 1) {
    const passed = rng.chance(PASS_RATE[step]);
    attempts.push({ person_id: person.id, partner_id: p.id, step, track, attempted_at: when,
      fee: program.exams.fees[step], passed, paid_by: "partner", voucher_source: null });
    if (passed) {
      creds.push({ person_id: person.id, partner_id: p.id, step, track, issuer: program.credentials.issuer, issued_at: when,
        expires_at: when + program.credentials.level_valid_days * DAY, last_product_use_at: productUse(rng, when, p) });
      return;
    }
    if (!rng.chance(RETRY_RATE)) return;
    when = startOfDay(when + rng.int(14, 45) * DAY);
  }
}

/** Levels last 12 months. Most active partners recertify around expiry (decision 47). */
function recertify(
  rng: Rng, partners: Partner[], creds: Draft<Credential>[], attempts: Draft<ExamAttempt>[], people: Map<string, Person>,
): void {
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const expiring = creds.filter((c) => c.expires_at !== null && c.expires_at <= AS_OF);
  for (const c of expiring) {
    const p = partnerById.get(c.partner_id)!;
    if (p.status !== "active" || !rng.chance(RECERTIFY_RATE)) continue;
    const step = c.step as "level_1" | "level_2" | "level_3";
    sitExam(rng, p, people.get(c.person_id)!, step, c.track!, c.expires_at! - rng.int(0, 20) * DAY, creds, attempts);
  }
}

/** Last hands-on product use: usually recent, sometimes stale (decision 47). */
function productUse(rng: Rng, issued: number, p: Partner): number {
  const end = Math.min(AS_OF, p.activeUntil);
  if (rng.chance(STALE_USE_RATE) || end - issued < 5 * DAY) return startOfDay(Math.min(end, issued + rng.int(0, 30) * DAY));
  return startOfDay(end - rng.int(0, 60) * DAY);
}

function byPersonId(people: Person[]): Map<string, Person> {
  return new Map(people.map((x) => [x.id, x]));
}
