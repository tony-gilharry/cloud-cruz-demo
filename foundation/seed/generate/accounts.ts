// Customer and prospect accounts. Mid-market software companies are the
// primary ICP (decision 14), in the Year-1 regions (decision 67).
import { id } from "../config.ts";
import { accountName, personNames } from "../names.ts";
import type { Rng } from "../rng.ts";
import type { Account, Region, Segment } from "../types.ts";

export const ACCOUNT_COUNT = 3000;
const SEGMENT_MIX: [Segment, number][] = [["smb", 30], ["midmarket", 55], ["enterprise", 15]];
const EMPLOYEES: Record<Segment, [number, number]> = { smb: [40, 199], midmarket: [200, 2000], enterprise: [2001, 25000] };
const REGION_MIX: [Region, number][] = [["us", 72], ["canada", 9], ["uk_ireland", 10], ["anz", 5], ["latam", 4]];

export function generateAccounts(rng: Rng): Account[] {
  const aes = personNames(rng, 12);
  const names = new Set<string>();
  const accounts: Account[] = [];
  for (let n = 1; n <= ACCOUNT_COUNT; n += 1) {
    const segment = rng.weighted(SEGMENT_MIX);
    const [min, max] = EMPLOYEES[segment];
    accounts.push({
      id: id("A", n, 4),
      name: accountName(rng, names),
      segment,
      region: rng.weighted(REGION_MIX),
      // Log-uniform, so most companies sit near the bottom of their band.
      employees: Math.round(min * Math.pow(max / min, rng.next())),
      owner: rng.pick(aes),
    });
  }
  return accounts;
}
