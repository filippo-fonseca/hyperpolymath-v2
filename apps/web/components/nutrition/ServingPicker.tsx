"use client";

/**
 * ServingPicker — shown after a food is selected in FoodSearch.
 *
 * sd register:
 *   - sd Select lists serving options (default option first per isDefault)
 *   - sd Input for quantity multiplier (numeric, default 1)
 *   - Live macro preview: "→ {kcal} kcal · P {p}g · C {c}g · F {f}g" in mono 11px ink-faint
 *   - Confirm: accent "Log" Button OR Enter key; Cancel = ghost Button
 */

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { computeMacros, resolveBaseAmount } from "@/lib/nutrition/macro-math";
import type { FoodSearchResultData } from "./FoodSearchResult";

export type ServingOption = {
  id: string | null;
  label: string;
  gramsOrMl: number;
  isDefault: boolean;
};

interface Props {
  food: FoodSearchResultData;
  servingOptions: ServingOption[];
  onConfirm: (params: { servingOptionId: string | null; quantity: number }) => void;
  onCancel: () => void;
}

export function ServingPicker({ food, servingOptions, onConfirm, onCancel }: Props) {
  // Default serving is the first option with isDefault:true, or the first overall
  const defaultOption =
    servingOptions.find((o) => o.isDefault) ?? servingOptions[0];

  const [selectedId, setSelectedId] = useState<string>(
    defaultOption?.id ?? "__100g",
  );
  const [quantity, setQuantity] = useState<string>("1");

  const quantityNum = parseFloat(quantity) || 1;

  const selectedOption = useMemo(() => {
    if (selectedId === "__100g") {
      return { id: null, gramsOrMl: 100 } as const;
    }
    return (
      servingOptions.find((o) => o.id === selectedId) ?? {
        id: null,
        gramsOrMl: 100,
      }
    );
  }, [selectedId, servingOptions]);

  const preview = useMemo(() => {
    const baseAmount = resolveBaseAmount(
      quantityNum,
      selectedOption.gramsOrMl,
    );
    return computeMacros(baseAmount, {
      kcalPer100g: food.kcalPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
      fiberPer100g: food.fiberPer100g ?? null,
    });
  }, [food, quantityNum, selectedOption]);

  function handleConfirm() {
    const q = parseFloat(quantity);
    if (!q || q <= 0) return;
    onConfirm({
      servingOptionId: selectedOption.id ?? null,
      quantity: q,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  // Build the Select value list — ensure fallback 100g is always present
  const has100g = servingOptions.some((o) => o.gramsOrMl === 100);
  const displayOptions: ServingOption[] = [
    ...servingOptions,
    ...(!has100g
      ? [
          {
            id: null,
            label: food.baseUnit === "ml" ? "100 ml" : "100 g",
            gramsOrMl: 100,
            isDefault: servingOptions.length === 0,
          },
        ]
      : []),
  ];

  return (
    <div
      className="flex flex-col gap-4 px-1"
      onKeyDown={handleKeyDown}
    >
      {/* Food name recap */}
      <div>
        <p className="text-body font-semibold leading-tight tracking-[-0.01em] text-[var(--sd-ink)]">
          {food.name}
        </p>
        {food.brand && (
          <p className="text-meta leading-tight text-[var(--sd-ink-dull)]">
            {food.brand}
          </p>
        )}
      </div>

      {/* Serving selector + quantity */}
      <div className="flex items-center gap-3">
        <Select
          value={selectedId}
          onValueChange={setSelectedId}
        >
          <SelectTrigger className="flex-1 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {displayOptions.map((opt) => (
              <SelectItem
                key={opt.id ?? "__100g"}
                value={opt.id ?? "__100g"}
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-24">
          <Input
            type="number"
            step="0.1"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-9 text-sm tabular-nums"
            aria-label="Quantity"
          />
        </div>
      </div>

      {/* Live macro preview */}
      <p className="font-mono text-micro tabular-nums text-[var(--sd-ink-faint)]">
        {`→ ${preview.kcal} kcal · P ${preview.proteinG}g · C ${preview.carbsG}g · F ${preview.fatG}g`}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleConfirm}
          className="text-micro"
        >
          Log
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-micro"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
