"use client";


export type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";

const SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snacks", label: "Snacks" },
];

interface Props {
  value: MealSlot;
  onChange: (v: MealSlot) => void;
}

/**
 * MealSlotPillBar — sd segmented tab strip for the active meal slot, sharing the
 * exact grammar of the habits Today/Manage/Archive tabs: a `--sd-box` rail with
 * a hairline border, and an active tab lifted onto `--sd-input` with an inset
 * ring. No glass, no backdrop-blur, no neumorphic shadows.
 */
export function MealSlotPillBar({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Meal slot navigation"
      className="flex w-fit items-center gap-0.5 rounded-lg border border-[var(--sd-line)] bg-[var(--sd-box)] p-0.5"
    >
      {SLOTS.map((slot) => {
        const isActive = slot.value === value;
        return (
          <button
            key={slot.value}
            type="button"
            role="tab"
            aria-current={isActive ? "true" : undefined}
            aria-pressed={isActive}
            onClick={() => onChange(slot.value)}
            className="craft-chip cursor-pointer-always"
          >
            {slot.label}
          </button>
        );
      })}
    </div>
  );
}
