import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  RANKS,
  didAscendRank,
  levelFromXp,
  nextRankForLevel,
  rankForLevel,
  totalXpForLevel,
  xpToNextLevel,
} from '@/lib/xp/levels';
import {
  XP_CATEGORIES,
  XP_CATEGORY_META,
  XP_KINDS,
  XP_KIND_META,
  categoryForKind,
  metaForKind,
} from '@/lib/xp/rules';

describe('xp curve', () => {
  it('starts everyone at level 1 with zero progress', () => {
    const p = levelFromXp(0);
    expect(p.level).toBe(1);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.progress).toBe(0);
  });

  it('costs strictly more to clear each successive level', () => {
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
    }
  });

  it('lands exactly on a level boundary at its cumulative cost', () => {
    for (const level of [2, 5, 10, 25, 40]) {
      const p = levelFromXp(totalXpForLevel(level));
      expect(p.level).toBe(level);
      expect(p.xpIntoLevel).toBe(0);
    }
  });

  it('sits in the previous level one XP short of the boundary', () => {
    const p = levelFromXp(totalXpForLevel(10) - 1);
    expect(p.level).toBe(9);
    expect(p.xpRemaining).toBe(1);
  });

  it('agrees with the incremental cost at every boundary', () => {
    for (let l = 1; l < 30; l++) {
      expect(totalXpForLevel(l + 1) - totalXpForLevel(l)).toBe(xpToNextLevel(l));
    }
  });

  it('reports progress as a fraction that never leaves 0..1', () => {
    for (const xp of [0, 1, 79, 80, 500, 12_345, 5_000_000]) {
      const p = levelFromXp(xp);
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThanOrEqual(1);
    }
  });

  it('keeps xpIntoLevel + xpRemaining equal to the level cost', () => {
    for (const xp of [0, 55, 340, 9_001, 44_444]) {
      const p = levelFromXp(xp);
      expect(p.xpIntoLevel + p.xpRemaining).toBe(p.xpForLevel);
    }
  });

  it('clamps at the max level instead of running away', () => {
    const p = levelFromXp(50_000_000);
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.isMaxLevel).toBe(true);
    expect(p.xpRemaining).toBe(0);
    expect(p.progress).toBe(1);
  });

  it('treats negative and fractional totals as floored non-negative', () => {
    expect(levelFromXp(-500).level).toBe(1);
    expect(levelFromXp(-500).totalXp).toBe(0);
    expect(levelFromXp(99.9).totalXp).toBe(99);
  });

  it('never goes down as XP goes up', () => {
    let last = 0;
    for (let xp = 0; xp < 60_000; xp += 137) {
      const level = levelFromXp(xp).level;
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });
});

describe('ranks', () => {
  it('maps levels into the expected bands', () => {
    expect(rankForLevel(1).name).toBe('Initiate');
    expect(rankForLevel(4).name).toBe('Initiate');
    expect(rankForLevel(5).name).toBe('Apprentice');
    expect(rankForLevel(50).name).toBe('Renaissance');
    expect(rankForLevel(MAX_LEVEL).name).toBe('Renaissance');
  });

  it('is ordered and starts at level 1', () => {
    expect(RANKS[0].minLevel).toBe(1);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].minLevel).toBeGreaterThan(RANKS[i - 1].minLevel);
    }
  });

  it('has no next rank once you are in the final band', () => {
    expect(nextRankForLevel(4)?.name).toBe('Apprentice');
    expect(nextRankForLevel(50)).toBeNull();
  });

  it('flags an ascension only when the band actually changes', () => {
    expect(didAscendRank(4, 5)).toBe(true);
    expect(didAscendRank(5, 6)).toBe(false);
    expect(didAscendRank(3, 12)).toBe(true);
  });
});

describe('presentation registry', () => {
  it('describes every kind the migration seeds', () => {
    for (const kind of XP_KINDS) {
      const meta = XP_KIND_META[kind];
      expect(meta, `missing meta for ${kind}`).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(XP_CATEGORIES).toContain(meta.category);
    }
  });

  it('gives every category a label and a colour', () => {
    for (const category of XP_CATEGORIES) {
      expect(XP_CATEGORY_META[category].label.length).toBeGreaterThan(0);
      expect(XP_CATEGORY_META[category].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('falls back rather than throwing on a kind it has never seen', () => {
    expect(() => metaForKind('some.future.kind')).not.toThrow();
    expect(metaForKind('some.future.kind').label).toBeTruthy();
    expect(XP_CATEGORIES).toContain(categoryForKind('some.future.kind'));
  });
});
