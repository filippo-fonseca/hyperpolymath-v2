"use client";

/**
 * FoodSearchResult — single row in the food search result list.
 *
 * sd register: sans food name, mono kcal, list-row bg tint on focus/hover.
 *   - Food name: 14px --sd-ink
 *   - Brand: 12px --sd-ink-dull
 *   - kcal/100g: mono 11px --sd-ink-faint, right-aligned
 *   - Focused (keyboard) = --sd-selected tint; hover = --sd-hover
 *   - aria-selected on keyboard focus
 */

export type FoodSearchResultData = {
  /** null for history items that have no barcode */
  offBarcode?: string | null;
  /** DB id — only present for history items already in the user's foods table */
  id?: string;
  name: string;
  brand: string | null;
  kcalPer100g: number | string;
  proteinPer100g: number | string;
  carbsPer100g: number | string;
  fatPer100g: number | string;
  fiberPer100g?: number | string | null;
  sodiumPer100g?: number | string | null;
  baseUnit?: "g" | "ml";
  servingSizeLabel?: string | null;
  servingQuantity?: number | null;
  /** Source of the result */
  source: "history" | "off";
};

interface Props {
  result: FoodSearchResultData;
  isFocused: boolean;
  onSelect: (result: FoodSearchResultData) => void;
}

export function FoodSearchResult({ result, isFocused, onSelect }: Props) {
  const kcal =
    typeof result.kcalPer100g === "string"
      ? Math.round(parseFloat(result.kcalPer100g))
      : Math.round(result.kcalPer100g);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isFocused}
      onClick={() => onSelect(result)}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors duration-[120ms] ease-out focus:outline-none ${
        isFocused ? "bg-[var(--sd-selected)]" : "hover:bg-[var(--sd-hover)]"
      }`}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1 pr-3">
        <span className="truncate text-meta font-medium leading-tight text-[var(--sd-ink)]">
          {result.name}
        </span>
        {result.brand && (
          <span className="truncate text-micro leading-tight text-[var(--sd-ink-dull)]">
            {result.brand}
          </span>
        )}
      </div>
      <span className="shrink-0 font-mono text-micro tabular-nums text-[var(--sd-ink-faint)]">
        {kcal} kcal/100g
      </span>
    </button>
  );
}
