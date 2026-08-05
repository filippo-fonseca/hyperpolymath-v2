"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  setPageFieldHidden,
  setPageFieldValue,
  updateFieldDefinition,
} from "@/app/actions/page-fields";
import {
  type PageFieldSelectOption,
  type PageFieldType,
  type PageFieldValue,
  type PageFieldWithValue,
  asSelectIds,
  nextTagColor,
  newId,
  tagColorStyle,
} from "@/lib/pages/custom-fields";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronRight,
  Eye,
  EyeOff,
  Hash,
  Plus,
  Tags,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";

const TYPE_ICON: Record<PageFieldType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: Tags,
  checkbox: CheckSquare,
};

interface PagePropertiesProps {
  pageId: string;
  /** Applicable properties for this page (wiki + folder), with value + hidden. */
  fields: PageFieldWithValue[];
  /** Invalidate the pages query after any mutation. */
  onChanged: () => void;
}

/**
 * Issue #165 — the page's Properties block. Properties are defined wiki-wide or
 * per top-level folder (managed elsewhere); this block only shows the applicable
 * ones, lets you set values, and toggle each property's visibility on THIS page.
 * There is no create/add here by design. Collapsed by default (Notion-style).
 */
export function PageProperties({ pageId, fields, onChanged }: PagePropertiesProps) {
  const [expanded, setExpanded] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // No applicable properties → render nothing (keeps bare pages clean).
  if (fields.length === 0) return null;

  const visible = fields.filter((f) => !f.hidden);
  const hidden = fields.filter((f) => f.hidden);

  async function saveValue(fieldDefinitionId: string, value: PageFieldValue) {
    await setPageFieldValue({ pageId, fieldDefinitionId, value });
    onChanged();
  }
  async function setHidden(fieldDefinitionId: string, next: boolean) {
    await setPageFieldHidden({ pageId, fieldDefinitionId, hidden: next });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-1">
      {/* aug-04 craft-ui-v2: the properties toggle is a rest-state craft chip
          (also retires the uppercase mono eyebrow — uppercase is banned outside
          kbd + sidebar eyebrows). */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="craft-chip group/pt w-fit cursor-pointer"
      >
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          className={cn("transition-transform duration-200", expanded && "rotate-90")}
        />
        <span>Properties</span>
        <span className="text-micro text-[var(--ink-faint)]">{visible.length}</span>
      </button>

      {expanded && (
        <div className="rounded-xl bg-[var(--surface)] px-2 py-1.5 flex flex-col gap-0.5">
          {visible.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              onSave={(value) => saveValue(field.id, value)}
              onHide={() => setHidden(field.id, true)}
              onChanged={onChanged}
            />
          ))}

          {hidden.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                className="flex items-center gap-1 w-fit mt-0.5 px-1.5 py-1 rounded-md text-micro text-[var(--ink-muted)] opacity-70 hover:opacity-100 hover:text-[var(--ink)] transition-all duration-150 cursor-pointer"
              >
                <ChevronRight
                  size={11}
                  strokeWidth={1.5}
                  className={cn("transition-transform duration-200", showHidden && "rotate-90")}
                />
                {hidden.length} hidden
              </button>
              {showHidden &&
                hidden.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    dimmed
                    onSave={(value) => saveValue(field.id, value)}
                    onHide={() => setHidden(field.id, false)}
                    onChanged={onChanged}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  onSave,
  onHide,
  onChanged,
  dimmed,
}: {
  field: PageFieldWithValue;
  onSave: (value: PageFieldValue) => Promise<void>;
  onHide: () => void;
  onChanged: () => void;
  dimmed?: boolean;
}) {
  const Icon = TYPE_ICON[field.type];
  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 min-h-[34px] rounded-lg px-1 hover:bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)] transition-colors duration-150",
        dimmed && "opacity-60",
      )}
    >
      <div
        className="flex items-center gap-1.5 shrink-0 self-center w-[128px] px-1.5 py-1 text-[12px] font-mono text-[var(--ink-muted)]"
        title={field.name}
      >
        <Icon size={12} strokeWidth={1.5} className="shrink-0" />
        <span className="truncate">{field.name}</span>
      </div>
      <div className="flex-1 min-w-0 self-center">
        <FieldValueEditor field={field} onSave={onSave} onChanged={onChanged} />
      </div>
      <button
        type="button"
        onClick={onHide}
        title={field.hidden ? "Show on this page" : "Hide on this page"}
        className="shrink-0 self-center p-1 rounded text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--ink)] transition-all duration-150 cursor-pointer"
      >
        {field.hidden ? (
          <Eye size={13} strokeWidth={1.5} />
        ) : (
          <EyeOff size={13} strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
}

// ─── Value editors, one per field type ────────────────────────────────────────

function FieldValueEditor({
  field,
  onSave,
  onChanged,
}: {
  field: PageFieldWithValue;
  onSave: (value: PageFieldValue) => Promise<void>;
  onChanged: () => void;
}) {
  switch (field.type) {
    case "checkbox":
      return <CheckboxEditor field={field} onSave={onSave} />;
    case "date":
      return <DateEditor field={field} onSave={onSave} />;
    case "number":
      return <TextEditor field={field} onSave={onSave} numeric />;
    case "select":
      return <SelectEditor field={field} onSave={onSave} onChanged={onChanged} />;
    default:
      return <TextEditor field={field} onSave={onSave} />;
  }
}

function TextEditor({
  field,
  onSave,
  numeric,
}: {
  field: PageFieldWithValue;
  onSave: (value: PageFieldValue) => Promise<void>;
  numeric?: boolean;
}) {
  const initial = field.value === null || field.value === undefined ? "" : String(field.value);
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(initial);
  }, [initial, focused]);

  function commit() {
    setFocused(false);
    if (draft === initial) return;
    void onSave(draft);
  }

  return (
    <input
      type={numeric ? "number" : "text"}
      inputMode={numeric ? "decimal" : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(initial);
          e.currentTarget.blur();
        }
      }}
      placeholder="Empty"
      className="w-full bg-transparent px-2 py-1 text-[13px] font-sans text-[var(--ink)] placeholder:text-[var(--ink-muted)] rounded-md outline-none transition-all duration-150 hover:bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)] focus:bg-[color-mix(in_oklch,var(--surface)_96%,var(--ink))] focus:shadow-[inset_1px_1px_3px_var(--glass-lo),inset_-1px_-1px_2px_var(--glass-hi)]"
    />
  );
}

function DateEditor({
  field,
  onSave,
}: {
  field: PageFieldWithValue;
  onSave: (value: PageFieldValue) => Promise<void>;
}) {
  const value = typeof field.value === "string" ? field.value : "";
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => void onSave(e.target.value === "" ? null : e.target.value)}
      className="bg-transparent px-2 py-1 text-[13px] font-mono text-[var(--ink)] rounded-md outline-none transition-all duration-150 hover:bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)] focus:bg-[color-mix(in_oklch,var(--surface)_96%,var(--ink))] focus:shadow-[inset_1px_1px_3px_var(--glass-lo),inset_-1px_-1px_2px_var(--glass-hi)] [color-scheme:light_dark]"
    />
  );
}

function CheckboxEditor({
  field,
  onSave,
}: {
  field: PageFieldWithValue;
  onSave: (value: PageFieldValue) => Promise<void>;
}) {
  const checked = field.value === true;
  return (
    <div className="px-2 py-1 flex items-center">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => void onSave(next === true)}
        aria-label={field.name}
      />
    </div>
  );
}

function SelectEditor({
  field,
  onSave,
  onChanged,
}: {
  field: PageFieldWithValue;
  onSave: (value: PageFieldValue) => Promise<void>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const options = field.options ?? [];
  const selected = asSelectIds(field.value);
  const selectedOptions = selected
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is PageFieldSelectOption => Boolean(o));
  const query = newLabel.trim().toLowerCase();
  const filteredOptions = options.filter((o) => o.label.toLowerCase().includes(query));
  const canCreateOption =
    query.length > 0 && !options.some((o) => o.label.toLowerCase() === query);

  function toggle(optionId: string) {
    let next: string[];
    if (field.allowMultiple) {
      next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
    } else {
      next = selected.includes(optionId) ? [] : [optionId];
      setOpen(false);
    }
    void onSave(next.length === 0 ? null : next);
  }

  async function createOption() {
    const label = newLabel.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const option: PageFieldSelectOption = {
        id: newId(),
        label,
        color: nextTagColor(options),
      };
      await updateFieldDefinition({ id: field.id, options: [...options, option] });
      const next = field.allowMultiple ? [...selected, option.id] : [option.id];
      await onSave(next);
      onChanged();
      setNewLabel("");
      if (!field.allowMultiple) setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex flex-wrap items-center gap-1 w-full min-h-[28px] px-2 py-1 text-left rounded-md transition-colors duration-150 cursor-pointer hover:bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)]"
        >
          {selectedOptions.length === 0 ? (
            <span className="text-[13px] font-sans text-[var(--ink-muted)]">Empty</span>
          ) : (
            selectedOptions.map((o) => <TagChip key={o.id} option={o} />)
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0 overflow-hidden" align="start">
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            // biome-ignore lint/a11y/noAutofocus: focus belongs in the just-opened option input
            autoFocus
            value={newLabel}
            onValueChange={setNewLabel}
            placeholder="Search or create…"
          />
          <CommandList>
            <CommandEmpty>Type to create an option.</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((o) => (
                <CommandItem key={o.id} value={`opt-${o.id}`} onSelect={() => toggle(o.id)}>
                  <span className="flex-1 min-w-0">
                    <TagChip option={o} />
                  </span>
                  {selected.includes(o.id) && (
                    <Check size={12} strokeWidth={2} className="text-[var(--ink)] shrink-0" />
                  )}
                </CommandItem>
              ))}
              {canCreateOption && (
                <CommandItem
                  value="__create_option__"
                  disabled={busy}
                  onSelect={() => void createOption()}
                  className="text-[var(--ink-muted)]"
                >
                  <Plus size={12} strokeWidth={1.5} />
                  Create “{newLabel.trim()}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TagChip({ option }: { option: PageFieldSelectOption }) {
  const c = tagColorStyle(option.color);
  return (
    <span
      className="inline-flex items-center max-w-full px-1.5 py-0.5 rounded-sm text-[12px] font-sans truncate border"
      style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.border }}
    >
      {option.label}
    </span>
  );
}
