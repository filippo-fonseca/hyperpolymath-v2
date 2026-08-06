"use client";

import {
  createFieldDefinition,
  deleteFieldDefinition,
  reorderFieldDefinitions,
  updateFieldDefinition,
} from "@/app/actions/page-fields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ORDER,
  type PageFieldDefinition,
  type PageFieldSelectOption,
  type PageFieldType,
  nextTagColor,
  newId,
  tagColorStyle,
} from "@/lib/pages/custom-fields";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Hash,
  Plus,
  Tags,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useState } from "react";

const TYPE_ICON: Record<PageFieldType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: Tags,
  checkbox: CheckSquare,
};

interface PropertiesManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: "wiki" | "folder";
  /** Required when scope === 'folder': the top-level folder these props live on. */
  folderId?: string | null;
  folderName?: string;
  /** All of the user's definitions; filtered to this scope/folder internally. */
  definitions: PageFieldDefinition[];
  onChanged: () => void;
}

/**
 * Issue #165 — manage the property schema for the whole wiki or one top-level
 * folder. Add / rename / reorder / delete properties and edit select options.
 * Folder props cascade to the folder's descendant pages; wiki props apply
 * everywhere. Pages consume this schema; they never create properties.
 */
export function PropertiesManagerModal({
  open,
  onOpenChange,
  scope,
  folderId,
  folderName,
  definitions,
  onChanged,
}: PropertiesManagerModalProps) {
  const items = definitions
    .filter((d) =>
      scope === "wiki" ? d.scope === "wiki" : d.scope === "folder" && d.folderId === folderId,
    )
    .sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name));

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PageFieldType>("text");
  const [busy, setBusy] = useState(false);

  async function addProperty() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createFieldDefinition({
        scope,
        folderId: scope === "folder" ? folderId : undefined,
        name,
        type: newType,
        ...(newType === "select" ? { options: [] } : {}),
      });
      onChanged();
      setNewName("");
      setNewType("text");
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= items.length || busy) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setBusy(true);
    try {
      await reorderFieldDefinitions({ ids });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const title = scope === "wiki" ? "Wiki properties" : `${folderName ?? "Folder"} properties`;
  const description =
    scope === "wiki"
      ? "These apply to every page in the wiki."
      : "These apply to every page in this folder and its subfolders, on top of the wiki properties.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto -mx-1 px-1">
          {items.length === 0 && (
 <p className="px-1 py-2 text-meta font-serif italic text-[var(--ink-muted)]">
              No properties yet. Add one below.
            </p>
          )}
          {items.map((item, i) => (
            <ManagerRow
              key={item.id}
              item={item}
              index={i}
              count={items.length}
              busy={busy}
              onMove={move}
              onChanged={onChanged}
              setBusy={setBusy}
            />
          ))}
        </div>

        <div className="mt-1 border-t border-[var(--edge)] pt-3 flex flex-col gap-2">
 <div className="text-micro tracking-wide text-[var(--ink-muted)]">
            Add a property
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addProperty();
              }}
              placeholder="Property name"
 className="flex-1 min-w-0 px-2 py-1.5 text-meta font-sans bg-transparent border border-[var(--edge)] rounded-md text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={addProperty}
              disabled={busy || newName.trim() === ""}
 className="border border-[var(--sd-line)] bg-[var(--sd-box)] hover:bg-[var(--sd-hover)] shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-micro font-mono text-[var(--ink)] transition-colors duration-150 cursor-pointer disabled:opacity-40"
            >
              <Plus size={13} strokeWidth={1.75} />
              Add
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {FIELD_TYPE_ORDER.map((t) => {
              const Icon = TYPE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewType(t)}
                  className={cn(
 "flex items-center gap-1.5 px-2 py-1 rounded-md text-micro font-mono transition-colors duration-150 cursor-pointer border",
                    newType === t
                      ? "border-[color-mix(in_oklch,var(--accent)_45%,var(--edge))] text-[var(--ink)] bg-[color-mix(in_oklch,var(--accent)_10%,transparent)]"
                      : "border-[var(--edge)] text-[var(--ink-muted)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon size={12} strokeWidth={1.5} />
                  {FIELD_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManagerRow({
  item,
  index,
  count,
  busy,
  onMove,
  onChanged,
  setBusy,
}: {
  item: PageFieldDefinition;
  index: number;
  count: number;
  busy: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
  onChanged: () => void;
  setBusy: (v: boolean) => void;
}) {
  const Icon = TYPE_ICON[item.type];
  const [name, setName] = useState(item.name);
  const [optLabel, setOptLabel] = useState("");
  const options = item.options ?? [];

  async function commitName() {
    const n = name.trim();
    if (!n || n === item.name) {
      setName(item.name);
      return;
    }
    await updateFieldDefinition({ id: item.id, name: n });
    onChanged();
  }
  async function remove() {
    setBusy(true);
    try {
      await deleteFieldDefinition(item.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function setAllowMultiple(v: boolean) {
    await updateFieldDefinition({ id: item.id, allowMultiple: v });
    onChanged();
  }
  async function addOption() {
    const label = optLabel.trim();
    if (!label) return;
    const option: PageFieldSelectOption = { id: newId(), label, color: nextTagColor(options) };
    await updateFieldDefinition({ id: item.id, options: [...options, option] });
    onChanged();
    setOptLabel("");
  }
  async function removeOption(optId: string) {
    await updateFieldDefinition({
      id: item.id,
      options: options.filter((o) => o.id !== optId),
    });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg px-1.5 py-1.5 hover:bg-[color-mix(in_oklch,var(--surface-raised)_40%,transparent)] transition-colors duration-150">
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            disabled={busy || index === 0}
            onClick={() => onMove(index, -1)}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-30 cursor-pointer"
            title="Move up"
          >
            <ChevronUp size={12} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            disabled={busy || index === count - 1}
            onClick={() => onMove(index, 1)}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-30 cursor-pointer"
            title="Move down"
          >
            <ChevronDown size={12} strokeWidth={1.75} />
          </button>
        </div>
        <Icon size={13} strokeWidth={1.5} className="shrink-0 text-[var(--ink-muted)]" />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setName(item.name);
              e.currentTarget.blur();
            }
          }}
 className="flex-1 min-w-0 px-1.5 py-1 text-meta font-sans bg-transparent rounded-md text-[var(--ink)] outline-none hover:bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)] focus:bg-[color-mix(in_oklch,var(--surface)_96%,var(--ink))] transition-colors duration-150"
        />
 <span className="shrink-0 text-micro tracking-wide text-[var(--ink-muted)]">
          {FIELD_TYPE_LABELS[item.type]}
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Delete property (removes it from every page)"
          className="shrink-0 p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-coral)] transition-colors duration-150 cursor-pointer disabled:opacity-40"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      {item.type === "select" && (
        <div className="flex flex-col gap-1.5 pl-[26px]">
          <div className="flex flex-wrap items-center gap-1">
            {options.map((o) => {
              const c = tagColorStyle(o.color);
              return (
                <span
                  key={o.id}
 className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-micro font-sans border"
                  style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.border }}
                >
                  {o.label}
                  <button
                    type="button"
                    onClick={() => removeOption(o.id)}
                    className="hover:opacity-70 cursor-pointer"
                    title="Remove option"
                  >
                    <X size={10} strokeWidth={2} />
                  </button>
                </span>
              );
            })}
            <input
              type="text"
              value={optLabel}
              onChange={(e) => setOptLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addOption();
              }}
              placeholder="Add option…"
 className="min-w-[100px] flex-1 px-1.5 py-0.5 text-micro font-sans bg-transparent border border-dashed border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)]"
            />
          </div>
 <label className="flex items-center gap-1.5 text-micro font-mono text-[var(--ink-muted)] cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={item.allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
              className="accent-[var(--accent)] cursor-pointer"
            />
            Allow multiple (tags)
          </label>
        </div>
      )}
    </div>
  );
}
