"use client";

import { getDockWidgets, resolveDockedWidgets } from "@/components/shell/cockpit/dock-registry";
import { useRightSlot } from "@/components/shell/cockpit/right-slot-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, SlidersHorizontal } from "lucide-react";

/**
 * Which widgets are docked, and in what order.
 *
 * The chooser writes the FULL id array on every toggle, because absence of the
 * key is meaningful: it means "this user has never chosen", which falls back to
 * each widget's `defaultDocked`. Writing a partial list would make those two
 * states indistinguishable.
 *
 * It lists whatever is registered, so a new widget appears here the moment it
 * is added to the manifest, with no edit to this file.
 */
export function DockChooser() {
  const { dockedIds, setDockedIds } = useRightSlot();
  const all = getDockWidgets();
  const docked = new Set(resolveDockedWidgets(dockedIds).map((def) => def.id));

  function toggle(id: string) {
    const next = all
      .filter((def) => (def.id === id ? !docked.has(id) : docked.has(def.id)))
      .map((def) => def.id);
    setDockedIds(next);
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Choose dock widgets"
        className="flex size-6 shrink-0 items-center justify-center rounded text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
      >
        <SlidersHorizontal size={13} strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {all.map((def) => {
          const on = docked.has(def.id);
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => toggle(def.id)}
              aria-pressed={on}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-meta text-[var(--ink)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {on ? <Check size={13} strokeWidth={2} className="text-[var(--accent)]" /> : null}
              </span>
              <span className="truncate">{def.title}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
