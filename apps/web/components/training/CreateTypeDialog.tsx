"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createType } from "@/app/actions/training";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BatchRow } from "@/lib/db/queries/training";
import { TRAINING_PALETTE, paletteById } from "@/lib/training/palette";
import { cn } from "@/lib/utils";
import { ColorPicker } from "./ColorPicker";
import { IconPicker } from "./IconPicker";
import { TypeIcon } from "./TypeIcon";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allBatches: BatchRow[];
  /** Pre-select a batch when opening from inside a specific batch scope. */
  defaultBatchId?: string | null;
}

/**
 * Bigger, dedicated dialog for creating an activity type. Replaces the
 * cramped inline input — same vibe as the capture composer: one focused
 * surface, all the fields at once.
 */
export function CreateTypeDialog({
  open,
  onOpenChange,
  allBatches,
  defaultBatchId = null,
}: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(
    () => paletteById("cyan")?.oklch ?? TRAINING_PALETTE[0]!.oklch,
  );
  const [batchId, setBatchId] = useState<string | null>(defaultBatchId);
  const [icon, setIcon] = useState<string | null>(null);
  const [hasDistance, setHasDistance] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog re-opens so a previous draft doesn't bleed in.
  useEffect(() => {
    if (open) {
      setName("");
      setColor(paletteById("cyan")?.oklch ?? TRAINING_PALETTE[0]!.oklch);
      setBatchId(defaultBatchId);
      setIcon(null);
      setHasDistance(false);
    }
  }, [open, defaultBatchId]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const id = crypto.randomUUID();
    const res = await createType({
      id,
      batchId,
      name: trimmed,
      color,
      icon,
      hasDistance,
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || "Could not create type");
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New activity type</DialogTitle>
          <DialogDescription>
            A template you reuse across days — name, color, optional batch and
            distance tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Name + color + icon preview row */}
          <div className="flex items-center gap-3">
            <div
              aria-label="Selected color preview"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-[var(--edge)]"
              style={{ backgroundColor: color }}
            >
              {icon ? (
                <TypeIcon
                  name={icon}
                  size={16}
                  color="white"
                  className="drop-shadow-[0_0_2px_rgba(0,0,0,0.45)]"
                />
              ) : null}
            </div>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Run, Yoga, Bench…"
              className="h-9"
            />
          </div>

          {/* Color picker */}
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Color
            </div>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Icon picker */}
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Icon
            </div>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          {/* Batch select */}
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Batch
            </div>
            <div className="flex flex-wrap gap-1.5">
              <BatchPill
                label="Ungrouped"
                italic
                selected={batchId === null}
                onClick={() => setBatchId(null)}
              />
              {allBatches.map((b) => (
                <BatchPill
                  key={b.id}
                  label={b.name}
                  selected={batchId === b.id}
                  onClick={() => setBatchId(b.id)}
                />
              ))}
            </div>
          </div>

          {/* Distance toggle */}
          <label className="flex cursor-pointer items-center gap-2 rounded border border-[var(--edge)] bg-[var(--surface)] px-3 py-2 transition-colors hover:border-[var(--edge-hud)]">
            <input
              type="checkbox"
              checked={hasDistance}
              onChange={(e) => setHasDistance(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--ink)]"
            />
            <span className="flex flex-1 flex-col">
              <span className="font-serif text-sm">Track distance</span>
              <span className="text-xs text-[var(--ink-muted)]">
                Logs distance per completion (km / mi).
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || saving}
          >
            {saving ? "Creating…" : "Create type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchPill({
  label,
  italic,
  selected,
  onClick,
}: {
  label: string;
  italic?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        italic && "font-serif italic",
        selected
          ? "border-[var(--ink)] bg-[var(--surface-raised)] text-[var(--ink)]"
          : "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]",
      )}
    >
      {label}
    </button>
  );
}
