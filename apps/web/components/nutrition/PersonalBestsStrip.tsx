"use client";

// ---------------------------------------------------------------------------
// PersonalBestsStrip — three-column mono-typographic stat strip (D-12)
// Labels: LONGEST STREAK, HIGHEST SINGLE DAY, BEST ADHERENCE
// Value: .font-mono-stats text-[20px] per UI-SPEC typography contract
// ---------------------------------------------------------------------------

interface PersonalBests {
  longestStreakDays: number;
  highestKcal: number;
  bestAdherencePct: number;
}

interface PersonalBestsStripProps {
  bests: PersonalBests;
}

interface StatCellProps {
  label: string;
  value: string;
}

function StatCell({ label, value }: StatCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        {label}
      </span>
      <span
        className="font-mono-stats text-[20px] text-[var(--ink)]"
        style={{ lineHeight: 1.2 }}
      >
        {value}
      </span>
    </div>
  );
}

export function PersonalBestsStrip({ bests }: PersonalBestsStripProps) {
  return (
    <div className="grid grid-cols-3 gap-4 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-6">
      <StatCell
        label="Longest Streak"
        value={`${bests.longestStreakDays} days`}
      />
      <StatCell
        label="Highest Single Day"
        value={`${bests.highestKcal.toLocaleString()} kcal`}
      />
      <StatCell
        label="Best Adherence"
        value={`${bests.bestAdherencePct}%`}
      />
    </div>
  );
}
