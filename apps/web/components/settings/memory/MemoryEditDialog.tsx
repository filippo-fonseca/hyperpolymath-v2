"use client";

/**
 * MemoryEditDialog — edit a single jarvis_facts row.
 *
 * Phase 5.1 Plan 05.1-03 (D-M6 / JARVIS-18).
 *
 * Allows the user to update the `value` field of an existing fact.
 * On save, calls rememberFactAction (onConflictDoUpdate upsert scoped to
 * this user) which coerces source to "user_explicit" — any jarvis_suggested
 * fact that the user edits explicitly becomes user_explicit.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rememberFactAction } from "@/app/actions/jarvis-facts";
import { toast } from "sonner";

interface FactShape {
  id: string;
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
}

interface Props {
  fact: FactShape;
  onClose: () => void;
}

export function MemoryEditDialog({ fact, onClose }: Props) {
  const [value, setValue] = useState(fact.value);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await rememberFactAction({
        type: fact.type,
        key: fact.key,
        value,
        source: "user_explicit",
      });
      if (result.ok) {
        toast.success("Memory updated");
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">{fact.key}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
            {fact.type}
          </p>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="font-serif text-sm"
            placeholder="Enter the fact value..."
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || value.trim().length === 0}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
