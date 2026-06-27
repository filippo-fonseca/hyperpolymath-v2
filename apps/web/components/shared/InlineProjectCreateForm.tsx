"use client";

import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as React from "react";

export interface InlineProjectArea {
  id: string;
  name: string;
  emoji: string | null;
}

interface Props {
  /** Areas the new project can be filed under. Projects always live under an area. */
  areas: InlineProjectArea[];
  /** Creates the project; resolves to the new id, or null on failure. */
  onCreate: (input: { name: string; areaId: string }) => Promise<string | null>;
  /** Called with the new id after a successful create. */
  onDone: (newId: string) => void;
  /** Called when the user backs out without creating. */
  onCancel: () => void;
}

/**
 * Tiny "new project" form rendered inside a project picker's popover. Shared by
 * the captures and wiki-page pickers so the inline-create affordance reads the
 * same everywhere (the tasks picker has its own copy of this form predating the
 * shared extraction). The area select is the project's PARENT, not an area
 * assignment: projects always live under an area.
 */
export function InlineProjectCreateForm({ areas, onCreate, onDone, onCancel }: Props) {
  const [name, setName] = React.useState("");
  const [areaId, setAreaId] = React.useState<string>(areas[0]?.id ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || !areaId || submitting) return;
    setSubmitting(true);
    const newId = await onCreate({ name: trimmed, areaId });
    setSubmitting(false);
    if (newId) onDone(newId);
  }

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
        New project
      </p>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Project name"
        className="h-8 font-sans text-[13px]"
      />
      <Select value={areaId} onValueChange={setAreaId}>
        <SelectTrigger className="h-8 font-sans text-[13px]">
          <SelectValue placeholder="Select area" />
        </SelectTrigger>
        <SelectContent>
          {areas.map((a) => (
            <SelectItem key={a.id} value={a.id} className="font-sans text-[13px]">
              {`${a.emoji ?? ""} ${a.name}`.trim()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 font-sans text-[13px]"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 font-sans text-[13px]"
          onClick={() => void submit()}
          disabled={submitting || !name.trim() || !areaId}
        >
          {submitting ? (
            <>
              <Spinner size={12} label="Creating project" />
              Creating…
            </>
          ) : (
            "Create"
          )}
        </Button>
      </div>
    </div>
  );
}
