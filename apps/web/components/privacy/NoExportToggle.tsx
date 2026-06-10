"use client";

/**
 * NoExportToggle — privacy gate for the MCP personal-context export.
 *
 * Phase 999.12 Plan 05 / CTX-04. Flips no_export on a capture / task /
 * jarvis_fact row. When the flag is on, the snapshot builder (Plan 02's
 * per-node loaders) skips this row and increments meta.excludedNoExportCount,
 * so the user can see how many things are hidden from external agents on the
 * /settings/context page.
 *
 * Optimistic UX: useOptimistic flips the local state immediately so the user
 * sees the change without a round-trip. If the Server Action fails, we
 * revert and surface a toast — the same pattern used in CaptureCard and
 * CaptureDetailPanel.
 *
 * v1 mount (per CONTEXT.md): /settings/memory only (jarvis_facts row). The
 * captures + tasks no_export columns exist on the migration from day one
 * so future plans can mount this on per-capture and per-task detail
 * surfaces without further DB work.
 *
 * Styling is intentionally quiet — privacy controls should feel like a
 * subtle toggle, not a marketing button. Mono uppercase tracking-wide so
 * it slots into the existing FactCard chrome row without visual conflict.
 */

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { EyeOff, Eye } from "lucide-react";
import {
  setNoExportAction,
  type NoExportResource,
} from "@/app/(app)/settings/context/actions";

export type { NoExportResource };

interface Props {
  resource: NoExportResource;
  id: string;
  initial: boolean;
  /** Optional label override; defaults to "exported" / "hidden". */
  label?: { exported: string; hidden: string };
  className?: string;
}

export function NoExportToggle({
  resource,
  id,
  initial,
  label,
  className,
}: Props) {
  const [optimistic, setOptimistic] = useOptimistic<boolean, boolean>(
    initial,
    (_state, next) => next,
  );
  const [pending, startTransition] = useTransition();

  const exportedLabel = label?.exported ?? "exported";
  const hiddenLabel = label?.hidden ?? "hidden";

  const onClick = () => {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const res = await setNoExportAction(resource, id, next);
      if (!res.ok) {
        setOptimistic(!next);
        toast.error(res.error);
        return;
      }
      toast.success(
        next
          ? "Hidden from MCP export."
          : "Included in MCP export.",
      );
    });
  };

  const Icon = optimistic ? EyeOff : Eye;
  const stateLabel = optimistic ? hiddenLabel : exportedLabel;
  const title = optimistic
    ? "This item is hidden from the MCP personal-context export. Click to include."
    : "This item is included in the MCP personal-context export. Click to hide.";

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={title}
      title={title}
      disabled={pending}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 px-2 py-1",
        "font-mono text-[11px] uppercase tracking-[0.06em]",
        "transition-colors duration-100 ease-out cursor-pointer-always",
        "border border-[var(--edge)]",
        optimistic
          ? "text-[var(--ink-amber,var(--ink))]"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
        "disabled:opacity-40",
        className ?? "",
      ].join(" ")}
    >
      <Icon size={11} />
      <span>{`no-export · ${stateLabel}`}</span>
    </button>
  );
}
