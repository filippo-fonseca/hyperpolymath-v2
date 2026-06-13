"use client";

/**
 * QuickAddComposer — global keyboard shortcut 'n' opens FoodSearch.
 *
 * UI-SPEC D-07 (Dual Entry Points):
 *   - 'n' anywhere (not inside input/textarea/contenteditable, no modifier keys)
 *   - Pre-selects meal slot based on time of day:
 *     < 10:00  → "breakfast"
 *     10–13:59 → "lunch"
 *     17–20:59 → "dinner"
 *     else     → "snacks"
 *   - Slot pill bar above search input allows user to change the slot
 *
 * Implements NUTR-QUICKADD-01.
 */

import { useEffect, useState } from "react";
import { FoodSearch } from "./FoodSearch";
import type { MealSlot } from "./MealSlotPillBar";
import { MealSlotPillBar } from "./MealSlotPillBar";

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
  userId: string;
  date: string;
  foodHistory: FoodHistoryItem[];
}

/** Derive meal slot from current hour (UI-SPEC D-07 time-of-day defaulting) */
function getTimeOfDaySlot(): MealSlot {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h >= 17 && h < 21) return "dinner";
  return "snacks";
}

export function QuickAddComposer({ userId, date, foodHistory }: Props) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<MealSlot>("breakfast");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if modifier keys are held
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      // Ignore if the event key is not 'n'
      if (e.key !== "n") return;

      // Ignore if focus is inside an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      ) {
        return;
      }

      e.preventDefault();
      const computedSlot = getTimeOfDaySlot();
      setSlot(computedSlot);
      setOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Render a pill bar ABOVE the FoodSearch input so user can change slot
  // We wrap FoodSearch in a custom trigger + expose slot override via a local sheet
  // The slot picker is rendered as a small bar pinned at the top of the sheet
  return (
    <>
      {/* Slot pill bar is injected into the sheet via the SlotOverrideWrapper below */}
      <QuickAddSheet
        open={open}
        onOpenChange={setOpen}
        slot={slot}
        onSlotChange={setSlot}
        userId={userId}
        date={date}
        foodHistory={foodHistory}
      />
    </>
  );
}

/** Internal: wraps FoodSearch with a slot pill bar above the search input */
function QuickAddSheet({
  open,
  onOpenChange,
  slot,
  onSlotChange,
  userId,
  date,
  foodHistory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: MealSlot;
  onSlotChange: (slot: MealSlot) => void;
  userId: string;
  date: string;
  foodHistory: FoodHistoryItem[];
}) {
  // We reuse FoodSearch but inject a slot pill bar by passing the sheet content
  // Since FoodSearch renders its own Sheet, we need to compose at that level.
  // Use a custom approach: render the pill bar inside the sheet via a portal-friendly pattern.
  // Simplest: render FoodSearch and separately overlay a slot bar via a fixed ribbon.
  // Actually, FoodSearch renders the Sheet content — we need to extend it.
  // Best approach for MVP: render a mini slot pill below the search input.
  // FoodSearch accepts mealSlot as a prop — we control the slot here.

  return (
    <>
      {/* Slot selector ribbon — shown when quick-add is open */}
      {open && (
        <div
          className="fixed bottom-[86dvh] left-1/2 -translate-x-1/2 z-[60] flex justify-center"
          aria-hidden="true"
        >
          <MealSlotPillBar value={slot} onChange={onSlotChange} />
        </div>
      )}

      <FoodSearch
        open={open}
        onOpenChange={onOpenChange}
        mealSlot={slot}
        date={date}
        foodHistory={foodHistory}
        userId={userId}
      />
    </>
  );
}
