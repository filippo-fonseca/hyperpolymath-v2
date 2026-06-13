"use client";

import { motion } from "motion/react";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteLogAction } from "@/app/actions/nutrition";
import { useUndoToast } from "@/components/shared/use-undo-toast";

// Row shape from listFoodLogsForDay
export type FoodLogRowData = {
  log: {
    id: string;
    kcal: number;
    proteinG: string;
    carbsG: string;
    fatG: string;
    quantity: string;
    mealSlot: "breakfast" | "lunch" | "dinner" | "snacks";
  };
  food: {
    id: string;
    name: string;
    brand: string | null;
    baseUnit: string | null;
  } | null;
  serving: {
    id: string;
    label: string;
    gramsOrMl: string;
  } | null;
};

interface Props {
  log: FoodLogRowData;
}

/**
 * FoodLogRow — single food log entry in a meal slot list.
 *
 * UI-SPEC §"Food Log Row":
 *   - min-height 44px (touch target)
 *   - Left: food name (serif 16px) + brand (serif 16px ink-muted) + quantity (mono 10.5px ink-muted)
 *   - Right: kcal in font-mono-stats 20px + kebab menu with "Remove"
 *   - Motion: opacity:0 y:8 → opacity:1 y:0 on enter; opacity:0 x:-16 on exit
 *   - Delete: calls deleteLogAction + useUndoToast "Food removed"
 *
 * role="listitem" within role="list" (UI-SPEC §Accessibility Contract).
 */
export function FoodLogRow({ log }: Props) {
  const { show } = useUndoToast();

  const foodName = log.food?.name ?? "Unknown food";
  const brand = log.food?.brand ?? null;
  const servingLabel = log.serving?.label ?? "100 g";
  const qty = parseFloat(log.log.quantity);
  const quantityLabel = `${qty} × ${servingLabel}`;

  function handleRemove() {
    // Fire toast with deferred commit pattern (useUndoToast)
    show({
      message: "Food removed",
      optimisticRemove: () => {
        // Optimistic removal handled by Realtime invalidation after deleteLogAction
      },
      commit: async () => {
        await deleteLogAction({ logId: log.log.id });
      },
      undo: () => {
        // Future plan wires re-create; for now undo is a no-op that prevents commit
      },
      addBack: () => {
        // Mirror of undo — no-op in this phase
      },
    });
  }

  return (
    <motion.li
      role="listitem"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg hover:bg-[color-mix(in_oklch,var(--ink)_3%,transparent)] transition-colors duration-150"
    >
      {/* Left: food info */}
      <div className="flex-1 min-w-0">
        <p className="font-serif text-[16px] text-[var(--ink)] truncate">{foodName}</p>
        {brand && (
          <p className="font-serif text-[16px] text-[var(--ink-muted)] truncate">{brand}</p>
        )}
        <p className="font-mono text-[10.5px] text-[var(--ink-muted)] mt-0.5">
          {quantityLabel}
        </p>
      </div>

      {/* Right: kcal + kebab menu */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono-stats text-[20px] leading-none text-[var(--ink)] tabular-nums">
          {log.log.kcal}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Remove ${foodName}`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--ink)_6%,transparent)] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-doc)]"
            >
              <MoreVertical size={14} strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[120px]">
            <DropdownMenuItem
              className="text-[var(--ink-coral)] focus:text-[var(--ink-coral)] focus:bg-[color-mix(in_oklch,var(--ink-coral)_8%,transparent)]"
              onClick={handleRemove}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.li>
  );
}
