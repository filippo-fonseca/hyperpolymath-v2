import { describe, it, expect } from 'vitest';
import {
  retrievability,
  intervalForRetention,
  currentRetrievability,
  examProximity,
  effectiveTargetRetention,
  reviewTopic,
  nextDueDate,
  deriveStatus,
  projectedRetention,
  isExamReady,
  priorityFor,
  analyzeDay,
  daysBetween,
  TARGET_RETENTION,
  type TopicMemory,
  type StudyWeight,
} from '@/lib/study/scheduler';

const NOW = new Date('2026-09-01T12:00:00Z');

function topic(over: Partial<TopicMemory> = {}): TopicMemory {
  return {
    weight: 'working',
    difficulty: 5,
    stability: null,
    lastReviewedAt: null,
    reps: 0,
    lapses: 0,
    ...over,
  };
}

function daysFromNow(n: number): Date {
  return new Date(NOW.getTime() + n * 86_400_000);
}

describe('the forgetting curve', () => {
  it('defines stability as the point where retention hits 90%', () => {
    // This is the load-bearing property of the FACTOR constant. If it drifts,
    // every interval in the app silently means something else.
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 6);
    expect(retrievability(3, 3)).toBeCloseTo(0.9, 6);
    expect(retrievability(200, 200)).toBeCloseTo(0.9, 6);
  });

  it('starts at 1 and decays monotonically', () => {
    expect(retrievability(0, 10)).toBe(1);
    const series = [1, 5, 10, 30, 90].map((d) => retrievability(d, 10));
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeLessThan(series[i - 1]!);
    }
    expect(series.at(-1)!).toBeGreaterThan(0);
  });

  it('inverts cleanly: intervalForRetention is the inverse of retrievability', () => {
    for (const s of [1, 4, 20, 100]) {
      for (const target of [0.7, 0.85, 0.9, 0.95]) {
        const t = intervalForRetention(s, target);
        expect(retrievability(t, s)).toBeCloseTo(target, 6);
      }
    }
  });

  it('gives a longer interval for a lower retention bar', () => {
    expect(intervalForRetention(10, 0.7)).toBeGreaterThan(intervalForRetention(10, 0.95));
  });

  it('treats a never-reviewed topic as fully faded', () => {
    expect(currentRetrievability(topic(), NOW)).toBe(0);
  });
});

describe('weight sets the retention bar', () => {
  it('orders the presets from skim up to core', () => {
    const order: StudyWeight[] = ['skim', 'familiar', 'working', 'fluent', 'core'];
    for (let i = 1; i < order.length; i++) {
      expect(TARGET_RETENTION[order[i]!]).toBeGreaterThan(TARGET_RETENTION[order[i - 1]!]);
    }
  });

  it('holds a core topic to a tighter interval than a skim topic', () => {
    const core = nextDueDate('core', 20, NOW, null);
    const skim = nextDueDate('skim', 20, NOW, null);
    expect(core.getTime()).toBeLessThan(skim.getTime());
  });
});

describe('exam anchoring', () => {
  it('is inert with no assessment and outside the ramp', () => {
    expect(examProximity(NOW, null)).toBe(0);
    expect(examProximity(NOW, daysFromNow(30))).toBe(0);
  });

  it('ramps to 1 over the final fortnight', () => {
    expect(examProximity(NOW, daysFromNow(14))).toBe(0);
    expect(examProximity(NOW, daysFromNow(7))).toBeCloseTo(0.5, 6);
    expect(examProximity(NOW, daysFromNow(0))).toBe(1);
    expect(examProximity(NOW, daysFromNow(-3))).toBe(1);
  });

  it('pulls every weight up toward the peak as the exam closes in', () => {
    const far = effectiveTargetRetention('skim', NOW, daysFromNow(60));
    const near = effectiveTargetRetention('skim', NOW, daysFromNow(2));
    expect(far).toBeCloseTo(0.7, 6);
    expect(near).toBeGreaterThan(0.9);
  });

  it('never lowers the bar for a topic already at the peak', () => {
    expect(effectiveTargetRetention('core', NOW, daysFromNow(60))).toBeCloseTo(0.95, 6);
    expect(effectiveTargetRetention('core', NOW, daysFromNow(1))).toBeCloseTo(0.95, 6);
  });

  it('never schedules a topic to fall due after its exam', () => {
    const exam = daysFromNow(5);
    // Stability high enough that the raw interval would land well past the exam.
    const due = nextDueDate('working', 300, NOW, exam);
    expect(due.getTime()).toBeLessThanOrEqual(exam.getTime());
  });

  it('leaves the interval alone when it already lands before the exam', () => {
    const exam = daysFromNow(90);
    const clamped = nextDueDate('working', 10, NOW, exam);
    const unclamped = nextDueDate('working', 10, NOW, null);
    expect(clamped.getTime()).toBe(unclamped.getTime());
  });
});

describe('reviewing a topic', () => {
  it('seeds state from the first attempt, scaled by how it went', () => {
    const blanked = reviewTopic(topic(), { grade: 'blanked', mode: 'blank_recall', now: NOW });
    const fluent = reviewTopic(topic(), { grade: 'fluent', mode: 'blank_recall', now: NOW });

    expect(blanked.reps).toBe(1);
    expect(blanked.lapses).toBe(1);
    expect(fluent.lapses).toBe(0);
    expect(fluent.stability).toBeGreaterThan(blanked.stability);
    // Difficulty is learned from the grade, not declared via weight.
    expect(blanked.difficulty).toBeGreaterThan(fluent.difficulty);
  });

  it('grows stability on success and collapses it on a blank', () => {
    const established = topic({ stability: 30, lastReviewedAt: daysFromNow(-30), reps: 4 });

    const solid = reviewTopic(established, { grade: 'solid', mode: 'problem_set', now: NOW });
    expect(solid.stability).toBeGreaterThan(30);

    const blanked = reviewTopic(established, { grade: 'blanked', mode: 'problem_set', now: NOW });
    expect(blanked.stability).toBeLessThan(30);
    expect(blanked.lapses).toBe(1);
  });

  it('rewards a fluent recall more than a shaky one', () => {
    const base = topic({ stability: 10, lastReviewedAt: daysFromNow(-10), reps: 2 });
    const shaky = reviewTopic(base, { grade: 'shaky', mode: 'blank_recall', now: NOW });
    const fluent = reviewTopic(base, { grade: 'fluent', mode: 'blank_recall', now: NOW });
    expect(fluent.stability).toBeGreaterThan(shaky.stability);
  });

  it('compounds faster for material that is easy for you', () => {
    const easy = topic({ stability: 10, difficulty: 2, lastReviewedAt: daysFromNow(-10), reps: 3 });
    const hard = topic({ stability: 10, difficulty: 9, lastReviewedAt: daysFromNow(-10), reps: 3 });
    const a = reviewTopic(easy, { grade: 'solid', mode: 'problem_set', now: NOW });
    const b = reviewTopic(hard, { grade: 'solid', mode: 'problem_set', now: NOW });
    expect(a.stability).toBeGreaterThan(b.stability);
  });

  it('keeps difficulty inside 1..10 under repeated blanks and wins', () => {
    let t = topic({ stability: 5, lastReviewedAt: daysFromNow(-5), reps: 1, difficulty: 9.8 });
    for (let i = 0; i < 10; i++) {
      const r = reviewTopic(t, { grade: 'blanked', mode: 'blank_recall', now: NOW });
      expect(r.difficulty).toBeLessThanOrEqual(10);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      t = { ...t, ...r };
    }
    for (let i = 0; i < 40; i++) {
      const r = reviewTopic(t, { grade: 'fluent', mode: 'blank_recall', now: NOW });
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      t = { ...t, ...r };
    }
  });

  it('caps stability so intervals stay meaningful for one school year', () => {
    let t = topic({ stability: 200, lastReviewedAt: daysFromNow(-1), reps: 8, difficulty: 1 });
    for (let i = 0; i < 5; i++) {
      const r = reviewTopic(t, { grade: 'fluent', mode: 'past_paper', now: NOW });
      expect(r.stability).toBeLessThanOrEqual(365);
      t = { ...t, ...r };
    }
  });
});

describe('passive review earns less', () => {
  it('gives a skim half the stability gain of a real retrieval', () => {
    const base = topic({ stability: 10, lastReviewedAt: daysFromNow(-10), reps: 3 });
    const recalled = reviewTopic(base, { grade: 'solid', mode: 'blank_recall', now: NOW });
    const skimmed = reviewTopic(base, { grade: 'solid', mode: 'skim', now: NOW });

    expect(skimmed.stability).toBeLessThan(recalled.stability);
    // Precisely half the GAIN, not half the value.
    const gain = recalled.stability - 10;
    expect(skimmed.stability - 10).toBeCloseTo(gain / 2, 6);
  });

  it('does not soften the penalty when a skim ends in a blank', () => {
    const base = topic({ stability: 10, lastReviewedAt: daysFromNow(-10), reps: 3 });
    const recalled = reviewTopic(base, { grade: 'blanked', mode: 'blank_recall', now: NOW });
    const skimmed = reviewTopic(base, { grade: 'blanked', mode: 'skim', now: NOW });
    expect(skimmed.stability).toBe(recalled.stability);
  });
});

describe('the headline behaviour', () => {
  it('brings a core topic blanked days before an exam back tomorrow, not in weeks', () => {
    const exam = daysFromNow(3);
    const established = topic({
      weight: 'core',
      stability: 40,
      lastReviewedAt: daysFromNow(-10),
      reps: 5,
    });

    const result = reviewTopic(established, {
      grade: 'blanked',
      mode: 'blank_recall',
      assessmentDate: exam,
      now: NOW,
    });

    const gap = daysBetween(NOW, result.nextDueAt);
    expect(gap).toBeGreaterThanOrEqual(1);
    expect(gap).toBeLessThan(2.5);
    expect(result.nextDueAt.getTime()).toBeLessThan(exam.getTime());
  });

  it('lets the same topic rest for weeks when no exam is near', () => {
    const established = topic({
      weight: 'core',
      stability: 40,
      lastReviewedAt: daysFromNow(-10),
      reps: 5,
    });
    const result = reviewTopic(established, {
      grade: 'fluent',
      mode: 'past_paper',
      assessmentDate: null,
      now: NOW,
    });
    expect(daysBetween(NOW, result.nextDueAt)).toBeGreaterThan(14);
  });

  it('tightens the same review as the exam approaches', () => {
    const base = topic({ weight: 'working', stability: 30, lastReviewedAt: daysFromNow(-5), reps: 4 });
    const far = reviewTopic(base, {
      grade: 'solid',
      mode: 'problem_set',
      assessmentDate: daysFromNow(120),
      now: NOW,
    });
    const near = reviewTopic(base, {
      grade: 'solid',
      mode: 'problem_set',
      assessmentDate: daysFromNow(10),
      now: NOW,
    });
    expect(daysBetween(NOW, near.nextDueAt)).toBeLessThan(daysBetween(NOW, far.nextDueAt));
  });

  it('always leaves at least a day between reviews', () => {
    const t = topic({ weight: 'core', stability: 1, lastReviewedAt: daysFromNow(-1), reps: 1 });
    const r = reviewTopic(t, {
      grade: 'blanked',
      mode: 'blank_recall',
      assessmentDate: daysFromNow(1),
      now: NOW,
    });
    expect(daysBetween(NOW, r.nextDueAt)).toBeGreaterThanOrEqual(1);
  });
});

describe('status and readiness', () => {
  it('walks the ladder as the trace becomes durable', () => {
    expect(deriveStatus(0, 0, 'solid')).toBe('not_started');
    expect(deriveStatus(1, 3, 'solid')).toBe('learning');
    expect(deriveStatus(4, 12, 'solid')).toBe('consolidating');
    expect(deriveStatus(6, 40, 'fluent')).toBe('exam_ready');
  });

  it('drops back to learning after a blank however stable it looked', () => {
    expect(deriveStatus(9, 90, 'blanked')).toBe('learning');
  });

  it('projects retention forward to the exam date', () => {
    const t = topic({ stability: 20, lastReviewedAt: NOW, reps: 3 });
    expect(projectedRetention(t, NOW)).toBeCloseTo(1, 6);
    expect(projectedRetention(t, daysFromNow(20))).toBeCloseTo(0.9, 6);
    expect(projectedRetention(t, daysFromNow(120))).toBeLessThan(0.7);
  });

  it('answers exam-readiness against the topic own bar', () => {
    const fresh = topic({ weight: 'working', stability: 60, lastReviewedAt: NOW, reps: 4 });
    expect(isExamReady(fresh, daysFromNow(7))).toBe(true);
    expect(isExamReady(fresh, daysFromNow(200))).toBe(false);
    // Never reviewed is never ready.
    expect(isExamReady(topic(), daysFromNow(7))).toBe(false);
  });
});

describe('the fading queue', () => {
  it('floors never-reviewed topics near the top', () => {
    expect(priorityFor(topic(), NOW, null)).toBeGreaterThan(0);
  });

  it('scores a fresh topic at or below zero', () => {
    const fresh = topic({ stability: 30, lastReviewedAt: NOW, reps: 3 });
    expect(priorityFor(fresh, NOW, null)).toBeLessThanOrEqual(0);
  });

  it('ranks a faded core topic above an equally faded skim topic', () => {
    const shared = { stability: 10, lastReviewedAt: daysFromNow(-40), reps: 3 };
    const core = priorityFor(topic({ ...shared, weight: 'core' }), NOW, null);
    const skim = priorityFor(topic({ ...shared, weight: 'skim' }), NOW, null);
    expect(core).toBeGreaterThan(skim);
  });

  it('raises urgency for a class with an exam in the ramp', () => {
    const t = topic({ stability: 10, lastReviewedAt: daysFromNow(-30), reps: 3 });
    expect(priorityFor(t, NOW, daysFromNow(2))).toBeGreaterThan(priorityFor(t, NOW, null));
  });

  it('grows as a topic fades further', () => {
    const recent = topic({ stability: 10, lastReviewedAt: daysFromNow(-12), reps: 3 });
    const stale = topic({ stability: 10, lastReviewedAt: daysFromNow(-90), reps: 3 });
    expect(priorityFor(stale, NOW, null)).toBeGreaterThan(priorityFor(recent, NOW, null));
  });

  it('puts material you have never studied above material you have merely forgotten', () => {
    // Deliberate: you cannot be examined on what you never learned, so an
    // untouched topic outranks a faded one of the same weight. A never-reviewed
    // topic scores its full target retention, which is the maximum any topic of
    // that weight can reach, so this falls out of the model rather than being
    // special-cased.
    const unstudied = topic({ weight: 'working' });
    const faded = topic({ weight: 'working', stability: 8, lastReviewedAt: daysFromNow(-60), reps: 2 });
    expect(priorityFor(unstudied, NOW, null)).toBeGreaterThan(priorityFor(faded, NOW, null));
  });

  it('sorts a realistic mix the way a person would', () => {
    const mix = [
      { id: 'fresh-core', t: topic({ weight: 'core', stability: 40, lastReviewedAt: NOW, reps: 5 }) },
      { id: 'unstudied-core', t: topic({ weight: 'core' }) },
      { id: 'faded-core', t: topic({ weight: 'core', stability: 8, lastReviewedAt: daysFromNow(-60), reps: 2 }) },
      { id: 'faded-skim', t: topic({ weight: 'skim', stability: 8, lastReviewedAt: daysFromNow(-60), reps: 2 }) },
    ];
    const ranked = mix
      .map((m) => ({ id: m.id, p: priorityFor(m.t, NOW, null) }))
      .sort((a, b) => b.p - a.p)
      .map((m) => m.id);

    expect(ranked).toEqual(['unstudied-core', 'faded-core', 'faded-skim', 'fresh-core']);
  });
});

describe('interleaving advice', () => {
  it('says nothing about a short day', () => {
    expect(analyzeDay([{ parentId: 'a' }, { parentId: 'a' }]).isBlocked).toBe(false);
  });

  it('flags a day that is entirely one unit', () => {
    const r = analyzeDay([{ parentId: 'a' }, { parentId: 'a' }, { parentId: 'a' }]);
    expect(r.isBlocked).toBe(true);
    expect(r.dominantParentId).toBe('a');
    expect(r.count).toBe(3);
  });

  it('stays quiet once the day mixes units', () => {
    expect(analyzeDay([{ parentId: 'a' }, { parentId: 'a' }, { parentId: 'b' }]).isBlocked).toBe(false);
  });

  it('does not flag loose topics that have no unit', () => {
    expect(analyzeDay([{ parentId: null }, { parentId: null }, { parentId: null }]).isBlocked).toBe(false);
  });
});
