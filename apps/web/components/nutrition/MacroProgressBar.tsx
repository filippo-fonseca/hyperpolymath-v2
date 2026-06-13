"use client";

interface Props {
  label: string;
  consumed: number;
  target: number;
  intent?: "kcal" | "protein" | "carbs" | "fat";
}

/**
 * MacroProgressBar — horizontal progress bar for a single macro.
 *
 * UI-SPEC §"Daily Macro Summary Bar":
 *   - label: uppercase mono 10.5px on left
 *   - progress bar: center, width transition 300ms ease-out-quart
 *   - consumed/target: mono 20px on right
 *   - Fill: ink-muted at 0–69%, hud-cyan at 70–99%, ink-sage at 100%+
 *   - role="progressbar" + aria-* for accessibility (UI-SPEC §Accessibility Contract)
 */
export function MacroProgressBar({ label, consumed, target, intent: _intent }: Props) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const atTarget = consumed >= target && target > 0;
  const nearTarget = pct >= 70 && !atTarget;

  const fillColor = atTarget
    ? "var(--ink-sage)"
    : nearTarget
      ? "var(--hud-cyan)"
      : "var(--ink-muted)";

  const isKcal = _intent === "kcal";
  const displayConsumed = isKcal
    ? Math.round(consumed)
    : Math.round(consumed * 10) / 10;
  const displayTarget = isKcal ? Math.round(target) : Math.round(target);
  const unitSuffix = isKcal ? " kcal" : "g";

  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)] w-16 shrink-0">
        {label}
      </span>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={consumed}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${label} progress`}
        className="flex-1 h-1.5 rounded-full bg-[var(--surface)] overflow-hidden"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: fillColor,
            transition: "width 300ms var(--ease-out-quart)",
          }}
        />
      </div>

      {/* Consumed / target */}
      <span className="font-mono-stats text-[20px] leading-none text-[var(--ink)] shrink-0 tabular-nums min-w-[80px] text-right">
        {displayConsumed}
        <span className="text-[var(--ink-muted)] text-[12px] ml-0.5">
          {" "}/ {displayTarget}
          {unitSuffix}
        </span>
      </span>
    </div>
  );
}
