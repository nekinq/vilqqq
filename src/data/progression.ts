/** Уровни, XP, репутация, чистота, персонал (Docs/Planning/VillageRevamp/EconomyProgression.md). */

export interface LevelDef {
  level: number;
  xp: number;
  customers: [number, number];
  maxActive: number;
}

export const LEVELS: LevelDef[] = [
  { level: 1, xp: 0, customers: [8, 12], maxActive: 3 },
  { level: 2, xp: 100, customers: [12, 18], maxActive: 3 },
  { level: 3, xp: 300, customers: [18, 24], maxActive: 4 },
  { level: 4, xp: 650, customers: [24, 32], maxActive: 4 },
  { level: 5, xp: 1100, customers: [32, 40], maxActive: 5 },
  { level: 6, xp: 1800, customers: [40, 48], maxActive: 5 },
];

export const MAX_LEVEL = LEVELS.length;

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (const l of LEVELS) if (xp >= l.xp) lvl = l.level;
  return lvl;
}

export function levelDef(level: number): LevelDef {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))]!;
}

export const XP = {
  fullPurchase: 10,
  partialPurchase: 6,
  tutorial: 20,
  cleanBonus: 1,
  cleanBonusThreshold: 90,
} as const;

export const REP = {
  start: 50,
  full: 0.35,
  partial: 0.1,
  missing: -0.5,
  tooExpensive: -0.25,
  impatient: -0.5,
  refusedDirty: -1.0,
  dirtComplaint: -0.25,
} as const;

/** Множитель числа покупателей от репутации. */
export function reputationFactor(rep: number): number {
  return 0.6 + 0.8 * (rep / 100);
}

export const DIRT_WEIGHTS = {
  footprints: 3,
  mud: 5,
  paper: 2,
  stain: 8,
  cobweb: 4,
  trash: 6,
} as const;

export type DirtKind = keyof typeof DIRT_WEIGHTS;

/** Доля входящих покупателей по чистоте. */
export function entryChance(cleanliness: number): number {
  if (cleanliness >= 85) return 1;
  if (cleanliness >= 60) return 0.9;
  if (cleanliness >= 30) return 0.65;
  return 0;
}

export const STAFF = {
  cashier: { level: 3, hireFee: 250, wage: 25 },
} as const;

export const GOAL = { level: 6, reputation: 80, streakDays: 3 } as const;
