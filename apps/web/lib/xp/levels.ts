/**
 * The XP curve.
 *
 * Every level costs a little more than the one before it, so early levels come
 * fast (a good first day should land you at level 2 or 3) and later ones turn
 * into a long, satisfying grind. The exponent is deliberately gentle: 1.25
 * grows faster than linear without the wall that a quadratic curve puts up
 * around level 20.
 */

/** Levels above this stop costing more; you can keep earning, but the bar stops moving. */
export const MAX_LEVEL = 60;

const CURVE_BASE = 80;
const CURVE_EXPONENT = 1.25;

/** XP needed to get from `level` to `level + 1`. Rounded to 10 so the UI reads cleanly. */
export function xpToNextLevel(level: number): number {
  const clamped = Math.max(1, Math.min(level, MAX_LEVEL));
  return Math.round((CURVE_BASE * clamped ** CURVE_EXPONENT) / 10) * 10;
}

/** Total XP required to have *reached* `level`. Level 1 sits at 0. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.max(1, level); l++) total += xpToNextLevel(l);
  return total;
}

// Cheap lookup table so the hot path (rendering a progress ring on every XP
// event) never re-runs the loop above.
const CUMULATIVE: number[] = (() => {
  const table = [0, 0]; // index 0 unused, level 1 starts at 0
  for (let l = 1; l <= MAX_LEVEL; l++) table[l + 1] = table[l] + xpToNextLevel(l);
  return table;
})();

export type LevelProgress = {
  level: number;
  /** XP earned since entering this level. */
  xpIntoLevel: number;
  /** XP the whole level costs. */
  xpForLevel: number;
  /** XP still to go before the next level. */
  xpRemaining: number;
  /** 0..1, for progress rings and bars. */
  progress: number;
  /** Cumulative XP at which this level began. */
  levelStartXp: number;
  totalXp: number;
  isMaxLevel: boolean;
};

/** Turn a lifetime XP total into everything the UI needs to draw a level. */
export function levelFromXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));

  let level = 1;
  while (level < MAX_LEVEL && xp >= CUMULATIVE[level + 1]) level++;

  const levelStartXp = CUMULATIVE[level];
  const isMaxLevel = level >= MAX_LEVEL;
  const xpForLevel = isMaxLevel ? xpToNextLevel(MAX_LEVEL) : CUMULATIVE[level + 1] - levelStartXp;
  const xpIntoLevel = xp - levelStartXp;

  return {
    level,
    xpIntoLevel,
    xpForLevel,
    xpRemaining: isMaxLevel ? 0 : Math.max(0, xpForLevel - xpIntoLevel),
    progress: isMaxLevel ? 1 : Math.min(1, xpIntoLevel / xpForLevel),
    levelStartXp,
    totalXp: xp,
    isMaxLevel,
  };
}

/**
 * Ranks. Every five levels you ascend into a new title, which is the moment
 * worth celebrating: levels tick by, ranks are the thing you tell people about.
 * The names lean Renaissance because the whole app does.
 */
export type Rank = {
  /** Lowest level in this band. */
  minLevel: number;
  name: string;
  /** One line shown on the ascension card. */
  blurb: string;
  /** Hue driving the ring gradient and badge tint. */
  hue: number;
};

export const RANKS: Rank[] = [
  { minLevel: 1, name: 'Initiate', blurb: 'The first marks on a blank page.', hue: 210 },
  { minLevel: 5, name: 'Apprentice', blurb: 'The habit is forming.', hue: 190 },
  { minLevel: 10, name: 'Scholar', blurb: 'You show up whether or not you feel like it.', hue: 165 },
  { minLevel: 15, name: 'Adept', blurb: 'The system is working for you now.', hue: 140 },
  { minLevel: 20, name: 'Artisan', blurb: 'Craft, not just completion.', hue: 95 },
  { minLevel: 25, name: 'Savant', blurb: 'Depth across more than one field.', hue: 55 },
  { minLevel: 30, name: 'Virtuoso', blurb: 'Effortless from the outside only.', hue: 38 },
  { minLevel: 35, name: 'Luminary', blurb: 'Other people navigate by your work.', hue: 22 },
  { minLevel: 40, name: 'Polymath', blurb: 'The name of the whole endeavour.', hue: 5 },
  { minLevel: 45, name: 'Magister', blurb: 'Mastery worth teaching.', hue: 330 },
  { minLevel: 50, name: 'Renaissance', blurb: 'Nothing outside your reach.', hue: 285 },
];

export function rankForLevel(level: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) rank = r;
  return rank;
}

/** The next rank up, or null once you are in the final band. */
export function nextRankForLevel(level: number): Rank | null {
  return RANKS.find((r) => r.minLevel > level) ?? null;
}

/** True when crossing from `before` to `after` levels you into a new rank. */
export function didAscendRank(beforeLevel: number, afterLevel: number): boolean {
  return rankForLevel(afterLevel).minLevel > rankForLevel(beforeLevel).minLevel;
}
