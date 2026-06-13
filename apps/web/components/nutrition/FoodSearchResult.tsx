"use client";

/**
 * FoodSearchResult — single row in the food search result list.
 *
 * UI-SPEC §"Food Search Surface":
 *   - Food name: serif 16px, var(--ink)
 *   - Brand: serif 16px, var(--ink-muted)
 *   - kcal/100g: mono 10.5px, var(--ink-muted), right-aligned
 *   - Hover: bg-[var(--surface)] tint (no glass per UI-SPEC — document discipline)
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
      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-doc)] ${
        isFocused ? "bg-[var(--surface)]" : "hover:bg-[var(--surface)]"
      }`}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1 pr-3">
        <span
          className="truncate text-[16px] leading-[1.5] text-[var(--ink)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {result.name}
        </span>
        {result.brand && (
          <span
            className="truncate text-[16px] leading-[1.5] text-[var(--ink-muted)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {result.brand}
          </span>
        )}
      </div>
      <span className="shrink-0 font-mono text-[10.5px] text-[var(--ink-muted)]">
        {kcal} kcal/100g
      </span>
    </button>
  );
}
