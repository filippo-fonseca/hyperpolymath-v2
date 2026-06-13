"use client";

/**
 * FoodSearch — food search sheet (D-08: search-as-you-type).
 *
 * UI-SPEC §"Food Search Surface":
 *   - Opens as a shadcn Sheet (bottom on mobile)
 *   - Grouped results: "Recent" (clock icon) + "From Open Food Facts"
 *   - Search placeholder: "Search foods or enter a name…" (exact UI-SPEC copy)
 *   - useDeferredValue + useEffect debounce (React 19 idiomatic, no external dep)
 *   - Min 2 chars to trigger OFF search
 *   - Loading: skeleton row with hud-receipt-shimmer
 *   - No results: "Can't find it? Enter it manually." (exact UI-SPEC copy)
 *   - On select: swap to ServingPicker
 *
 * Implements NUTR-SEARCH-01, NUTR-LOG-01, NUTR-MANUAL-01.
 */

import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Clock, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { logFoodAction, upsertFoodAction } from "@/app/actions/nutrition";
import type { NormalizedOffProduct } from "@/lib/nutrition/off-client";
import type { MealSlot } from "./MealSlotPillBar";
import {
  FoodSearchResult,
  type FoodSearchResultData,
} from "./FoodSearchResult";
import { ServingPicker, type ServingOption } from "./ServingPicker";
import { ManualEntryForm, type CreatedFoodResult } from "./ManualEntryForm";

type FoodHistoryItem = {
  id: string;
  name: string;
  brand: string | null;
  kcalPer100g: string;
  proteinPer100g: string;
  carbsPer100g: string;
  fatPer100g: string;
  baseUnit: string | null;
  lastUsedAt: Date | null;
  useCount: number;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealSlot: MealSlot;
  date: string;
  foodHistory: FoodHistoryItem[];
  userId: string;
  onLogged?: () => void;
}

type ViewState =
  | { kind: "search" }
  | {
      kind: "serving";
      food: FoodSearchResultData;
      servingOptions: ServingOption[];
    }
  | { kind: "manual" };

export function FoodSearch({
  open,
  onOpenChange,
  mealSlot,
  date,
  foodHistory,
  onLogged,
}: Props) {
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [offResults, setOffResults] = useState<NormalizedOffProduct[]>([]);
  const [isLoadingOff, setIsLoadingOff] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [view, setView] = useState<ViewState>({ kind: "search" });
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when sheet opens/closes
  useEffect(() => {
    if (open) {
      setQ("");
      setOffResults([]);
      setFocusedIndex(-1);
      setView({ kind: "search" });
      // Autofocus after sheet animation
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // React 19 idiomatic debounce: useEffect + useDeferredValue (D-08, UI-SPEC)
  useEffect(() => {
    if (deferredQ.length < 2) {
      setOffResults([]);
      setIsLoadingOff(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingOff(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/nutrition/search?q=${encodeURIComponent(deferredQ)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as { hits: NormalizedOffProduct[] };
        setOffResults(data.hits ?? []);
      } catch {
        // Ignore AbortError from cleanup
        setOffResults([]);
      } finally {
        setIsLoadingOff(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [deferredQ]);

  // Build filtered history results (client-side ilike)
  const historyResults: FoodSearchResultData[] = foodHistory
    .filter(
      (item) =>
        !q ||
        item.name.toLowerCase().includes(q.toLowerCase()) ||
        (item.brand?.toLowerCase().includes(q.toLowerCase()) ?? false),
    )
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      kcalPer100g: parseFloat(item.kcalPer100g),
      proteinPer100g: parseFloat(item.proteinPer100g),
      carbsPer100g: parseFloat(item.carbsPer100g),
      fatPer100g: parseFloat(item.fatPer100g),
      baseUnit: (item.baseUnit as "g" | "ml" | undefined) ?? "g",
      source: "history" as const,
    }));

  const offResultsMapped: FoodSearchResultData[] = offResults.map((r) => ({
    offBarcode: r.offBarcode,
    name: r.name,
    brand: r.brand,
    kcalPer100g: r.kcalPer100g,
    proteinPer100g: r.proteinPer100g,
    carbsPer100g: r.carbsPer100g,
    fatPer100g: r.fatPer100g,
    fiberPer100g: r.fiberPer100g,
    sodiumPer100g: r.sodiumPer100g,
    baseUnit: r.baseUnit,
    servingSizeLabel: r.servingSizeLabel,
    servingQuantity: r.servingQuantity,
    source: "off" as const,
  }));

  // Combined flat list for keyboard navigation
  const allResults = [...historyResults, ...offResultsMapped];

  async function handleSelectFood(food: FoodSearchResultData) {
    if (food.source === "off" && !food.id) {
      // OFF food not yet in DB — upsert it first
      const result = await upsertFoodAction({
        offBarcode: food.offBarcode ?? null,
        name: food.name,
        brand: food.brand,
        kcalPer100g: food.kcalPer100g,
        proteinPer100g: food.proteinPer100g,
        carbsPer100g: food.carbsPer100g,
        fatPer100g: food.fatPer100g,
        fiberPer100g: food.fiberPer100g ?? null,
        sodiumPer100g: food.sodiumPer100g ?? null,
        baseUnit: food.baseUnit ?? "g",
        servingSizeLabel: food.servingSizeLabel ?? null,
        servingQuantity: food.servingQuantity ?? null,
      });

      if (!result.success) {
        toast.error("Failed to save food. Try again.");
        return;
      }

      // Build serving options from the upserted food
      const servingOptions: ServingOption[] = [];
      if (food.servingQuantity && food.servingSizeLabel) {
        servingOptions.push({
          id: null, // We'll use null and let log resolve via 100g default until we fetch the real id
          label: food.servingSizeLabel,
          gramsOrMl: food.servingQuantity,
          isDefault: true,
        });
      }
      // Always include 100g fallback
      servingOptions.push({
        id: null,
        label: food.baseUnit === "ml" ? "100 ml" : "100 g",
        gramsOrMl: 100,
        isDefault: servingOptions.length === 0,
      });

      // Update food with DB id
      const enrichedFood: FoodSearchResultData = {
        ...food,
        id: result.data.id,
      };
      setView({ kind: "serving", food: enrichedFood, servingOptions });
    } else {
      // History food already in DB — build serving options from default (100g for now)
      const servingOptions: ServingOption[] = [
        {
          id: null,
          label: food.baseUnit === "ml" ? "100 ml" : "100 g",
          gramsOrMl: 100,
          isDefault: true,
        },
      ];
      setView({ kind: "serving", food, servingOptions });
    }
  }

  async function handleLog({
    servingOptionId,
    quantity,
  }: {
    servingOptionId: string | null;
    quantity: number;
  }) {
    const food =
      view.kind === "serving" ? view.food : null;
    if (!food?.id) return;

    const result = await logFoodAction({
      date,
      mealSlot,
      foodId: food.id,
      servingOptionId,
      quantity,
    });

    if (!result.success) {
      toast.error(result.error ?? "Failed to log food.");
      return;
    }

    toast("Food logged.");
    onLogged?.();
    onOpenChange(false);
  }

  function handleManualCreated(food: CreatedFoodResult) {
    const enriched: FoodSearchResultData = {
      id: food.id,
      name: food.name,
      brand: food.brand,
      kcalPer100g: food.kcalPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
      fiberPer100g: food.fiberPer100g ?? null,
      baseUnit: food.baseUnit,
      servingSizeLabel: food.servingSizeLabel,
      servingQuantity: food.servingQuantity,
      source: "history",
    };

    const servingOptions: ServingOption[] = [];
    if (food.servingQuantity && food.servingSizeLabel) {
      servingOptions.push({
        id: null,
        label: food.servingSizeLabel,
        gramsOrMl: food.servingQuantity,
        isDefault: true,
      });
    }
    servingOptions.push({
      id: null,
      label: food.baseUnit === "ml" ? "100 ml" : "100 g",
      gramsOrMl: 100,
      isDefault: servingOptions.length === 0,
    });

    setView({ kind: "serving", food: enriched, servingOptions });
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      const item = allResults[focusedIndex];
      if (item) handleSelectFood(item);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85dvh] overflow-y-auto rounded-t-xl bg-[var(--surface-raised)] px-4 pb-8 pt-6"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="sr-only">Search foods</SheetTitle>
        </SheetHeader>

        {view.kind === "search" && (
          <div className="flex flex-col gap-4">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-muted)]" />
              <Input
                ref={inputRef}
                aria-label="Search foods"
                aria-expanded={allResults.length > 0}
                placeholder="Search foods or enter a name…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setFocusedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                className="pl-9 focus-visible:ring-[var(--ring-hud)]"
              />
            </div>

            {/* Recent section */}
            {historyResults.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 px-1 mb-1">
                  <Clock className="h-3 w-3 text-[var(--ink-muted)]" />
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    Recent
                  </span>
                </div>
                <div role="listbox" className="flex flex-col gap-0.5">
                  {historyResults.map((result, i) => (
                    <FoodSearchResult
                      key={result.id ?? `history-${i}`}
                      result={result}
                      isFocused={focusedIndex === i}
                      onSelect={handleSelectFood}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* OFF results section */}
            {deferredQ.length >= 2 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 px-1 mb-1">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    From Open Food Facts
                  </span>
                </div>

                {isLoadingOff ? (
                  // Skeleton loading row
                  <div className="hud-receipt-shimmer h-12 rounded-md bg-[var(--surface)] animate-pulse" />
                ) : offResultsMapped.length > 0 ? (
                  <div role="listbox" className="flex flex-col gap-0.5">
                    {offResultsMapped.map((result, i) => (
                      <FoodSearchResult
                        key={result.offBarcode ?? `off-${i}`}
                        result={result}
                        isFocused={
                          focusedIndex === historyResults.length + i
                        }
                        onSelect={handleSelectFood}
                      />
                    ))}
                  </div>
                ) : (
                  // No results — manual entry fallback
                  <div className="flex flex-col gap-3 px-1 py-3">
                    <p
                      className="text-[16px] leading-[1.5] text-[var(--ink-muted)]"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      No matches found. Try a different name or add it manually.
                    </p>
                    <button
                      type="button"
                      onClick={() => setView({ kind: "manual" })}
                      className="self-start font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--hud-cyan)] hover:opacity-80 transition-opacity duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-hud)]"
                    >
                      Can't find it? Enter it manually.
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Manual entry link when no query yet */}
            {deferredQ.length < 2 && historyResults.length === 0 && (
              <div className="px-1 py-2">
                <button
                  type="button"
                  onClick={() => setView({ kind: "manual" })}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 focus:outline-none"
                >
                  Can't find it? Enter it manually.
                </button>
              </div>
            )}
          </div>
        )}

        {view.kind === "serving" && (
          <ServingPicker
            food={view.food}
            servingOptions={view.servingOptions}
            onConfirm={handleLog}
            onCancel={() => setView({ kind: "search" })}
          />
        )}

        {view.kind === "manual" && (
          <ManualEntryForm
            initialName={q || undefined}
            onCreated={handleManualCreated}
            onCancel={() => setView({ kind: "search" })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
