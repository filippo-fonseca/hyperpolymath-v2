"use client";

// ---------------------------------------------------------------------------
// PersonalBestsStrip — three-column mono-typographic stat strip (D-12)
// Labels: LONGEST STREAK, HIGHEST SINGLE DAY, BEST ADHERENCE
// Value: .font-mono-stats text-title per UI-SPEC typography contract
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
      <span className="text-micro text-[var(--sd-ink-faint)]">
        {label}
      </span>
      <span
        className="font-mono-stats text-title tabular-nums text-[var(--sd-ink)]"
        style={{ lineHeight: 1.2 }}
      >
        {value}
      </span>
    </div>
  );
}

export function PersonalBestsStrip({ bests }: PersonalBestsStripProps) {
  return (
    <div className="grid grid-cols-3 gap-4 rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-6 dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]">
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
