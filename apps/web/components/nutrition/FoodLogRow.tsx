"use client";

import { motion } from "motion/react";
import { MoreVertical, Trash2 } from "lucide-react";
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
      className="group/row flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-[var(--sd-hover)]"
    >
      {/* Left: food info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-[var(--sd-ink)]">
          {foodName}
          {brand && (
            <span className="ml-1.5 text-[var(--sd-ink-faint)]">{brand}</span>
          )}
        </p>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--sd-ink-faint)]">
          {quantityLabel}
        </p>
      </div>

      {/* Right: kcal + kebab menu */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[14px] font-black leading-none tabular-nums text-[var(--sd-ink)]">
          {log.log.kcal}
          <span className="ml-0.5 font-mono text-[10px] font-medium text-[var(--sd-ink-faint)]">
            kcal
          </span>
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Remove ${foodName}`}
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--sd-ink-faint)] transition-colors duration-150 hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] cursor-pointer-always"
            >
              <MoreVertical size={14} strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[120px]">
            <DropdownMenuItem variant="destructive" onClick={handleRemove}>
              <Trash2 size={14} /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.li>
  );
}
