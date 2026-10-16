// Seeded randomness. Every draw in the generator goes through one Rng, so
// the same seed always produces the same database, row for row.

export type Rng = ReturnType<typeof createRng>;

export function createRng(seed: number) {
  // mulberry32: tiny, fast and good enough for synthetic data. We avoid
  // Math.random because it cannot be seeded.
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const between = (min: number, max: number): number => min + next() * (max - min);
  const int = (min: number, max: number): number => Math.floor(between(min, max + 1));
  const chance = (p: number): boolean => next() < p;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];

  const normal = (): number => {
    // Box-Muller. 1 - next() keeps log() away from zero.
    const u = 1 - next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Deal sizes and project values are right-skewed, so draw them
  // log-normally around a median.
  const lognormal = (median: number, sigma: number): number => median * Math.exp(sigma * normal());

  // Pareto weights give the "few partners drive most pipeline" shape.
  const pareto = (alpha: number): number => 1 / Math.pow(1 - next(), 1 / alpha);

  const poisson = (lambda: number): number => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = next();
    while (p > limit) {
      k += 1;
      p *= next();
    }
    return k;
  };

  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = next() * total;
    for (const [value, w] of entries) {
      roll -= w;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
  };

  return { next, between, int, chance, pick, normal, lognormal, pareto, poisson, weighted };
}

/**
 * Weighted sampler over a fixed list, built once and drawn many times.
 * A linear scan per draw would be slow across 10k opportunities.
 */
export function createSampler<T>(items: readonly T[], weights: readonly number[]) {
  const cumulative: number[] = [];
  let total = 0;
  for (const w of weights) {
    total += w;
    cumulative.push(total);
  }
  return (rng: Rng): T => {
    const roll = rng.next() * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] > roll) hi = mid;
      else lo = mid + 1;
    }
    return items[lo];
  };
}
