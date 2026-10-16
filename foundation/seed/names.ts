// Invented company and person names. Every name is composed from neutral
// word parts, then checked against a blocklist so nothing resembles a real
// vendor, partner or customer.
import type { Rng } from "./rng.ts";

const PARTNER_ROOTS = [
  "North", "Bright", "Copper", "Silver", "Stone", "River", "Harbor", "Maple", "Cedar", "Summit",
  "Granite", "Beacon", "Lumen", "Tide", "Ember", "Frost", "Juniper", "Kestrel", "Linden", "Meridian",
  "Oak", "Pine", "Quarry", "Raven", "Sable", "Thistle", "Umber", "Vale", "Willow", "Yarrow",
  "Alder", "Birch", "Canyon", "Delta", "Fable", "Glen", "Hollow", "Iris", "Jetty", "Knoll",
  "Lark", "Moss", "Nimbus", "Orchard", "Prairie", "Quill", "Ridge", "Slate", "Talon", "Upland",
];
const PARTNER_ENDINGS = [
  "vale", "line", "field", "stone", "water", "gate", "wick", "ford", "point", "crest",
  "bridge", "haven", "mark", "worth", "shore", "brook", "craft", "light", "path", "wood",
];
const PARTNER_DESCRIPTORS: Record<string, readonly string[]> = {
  agency: ["Digital", "Studio", "Creative", "Interactive", "Collective", "Agency"],
  SI: ["Consulting", "Partners", "Advisory", "Solutions", "Group", "Systems"],
  ISV: ["Software", "Labs", "Apps", "Platforms", "Cloud"],
  tech: ["Technologies", "Data", "Networks", "Analytics", "Stack"],
  reseller: ["Supply", "Distribution", "Direct", "Commerce", "Channel"],
};

const ACCOUNT_FIRST = [
  "Halvor", "Quill", "Ashby", "Brenn", "Corva", "Dunmore", "Elstow", "Fenwick", "Garrow", "Hesket",
  "Ivel", "Jarrow", "Kelso", "Lowick", "Marrow", "Nettle", "Otter", "Pellow", "Rennick", "Selby",
  "Tarrant", "Ulver", "Varley", "Wexcombe", "Yardley", "Amble", "Bexley", "Carlow", "Denby", "Eskdale",
  "Farrow", "Gilling", "Hardwick", "Ingram", "Kirkby", "Lydney", "Morland", "Norland", "Oakham", "Penrose",
];
const ACCOUNT_SUFFIX = ["", "sen", "ton", "by", "wood", "more", "ley", "ham"];
const ACCOUNT_INDUSTRY = [
  "Freight", "Health", "Foods", "Outfitters", "Insurance", "Logistics", "Media", "Energy", "Bank",
  "Clinics", "Apparel", "Robotics", "Hotels", "Pharma", "Learning", "Motors", "Realty", "Farms",
  "Biotech", "Airlines", "Retail", "Credit Union", "Publishing", "Telecom", "Manufacturing",
];

const FIRST_NAMES = [
  "Maya", "Jonah", "Priya", "Tomas", "Aisha", "Declan", "Lena", "Marcus", "Sofia", "Ravi",
  "Hannah", "Kenji", "Olivia", "Mateo", "Grace", "Samir", "Ines", "Callum", "Noor", "Elliot",
  "Zara", "Felix", "Amara", "Rowan", "Leila", "Owen", "Mira", "Tariq", "Clara", "Dev",
  "Esme", "Joaquin", "Freya", "Kwame", "Lucia", "Arjun", "Nadia", "Theo", "Imani", "Silas",
];
const LAST_NAMES = [
  "Okafor", "Lindqvist", "Reyes", "Castellano", "Brandt", "Nakamura", "Adeyemi", "Moreau",
  "Kowalski", "Haddad", "Fitzgerald", "Varga", "Oduya", "Solberg", "Achebe", "Delacroix",
  "Mendes", "Okonkwo", "Larsen", "Quintero", "Sato", "Abara", "Novak", "Ferreira",
  "Dubois", "Iyer", "Mwangi", "Ortega", "Petrov", "Kaur", "Lindgren", "Afolabi",
];

// Anything that could be read as a real company. Checked case-insensitively
// against the name with spaces removed.
const BLOCKLIST = [
  "wpengine", "engine", "aws", "amazon", "webflow", "google", "microsoft", "azure", "salesforce",
  "hubspot", "oracle", "adobe", "shopify", "accenture", "deloitte", "slalom", "capgemini",
  "northstar", "silverline", "brightfield", "copperline", "stonebridge",
];

function isAllowed(name: string): boolean {
  const flat = name.toLowerCase().replace(/[^a-z]/g, "");
  return !BLOCKLIST.some((blocked) => flat.includes(blocked));
}

function uniqueName(rng: Rng, used: Set<string>, build: () => string): string {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const name = build();
    if (!used.has(name) && isAllowed(name)) {
      used.add(name);
      return name;
    }
  }
  throw new Error("Ran out of unique names. Add more word parts to names.ts.");
}

export function partnerName(rng: Rng, used: Set<string>, type: string): string {
  return uniqueName(rng, used, () => {
    const root = rng.pick(PARTNER_ROOTS) + rng.pick(PARTNER_ENDINGS);
    return `${root} ${rng.pick(PARTNER_DESCRIPTORS[type])}`;
  });
}

export function accountName(rng: Rng, used: Set<string>): string {
  return uniqueName(rng, used, () => {
    const base = rng.pick(ACCOUNT_FIRST) + rng.pick(ACCOUNT_SUFFIX);
    return `${base} ${rng.pick(ACCOUNT_INDUSTRY)}`;
  });
}

export function personNames(rng: Rng, count: number): string[] {
  const used = new Set<string>();
  const names: string[] = [];
  while (names.length < count) {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      names.push(name);
    }
  }
  return names;
}

/** One person's name. Names may repeat across a large program, as in life. */
export function personName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}
