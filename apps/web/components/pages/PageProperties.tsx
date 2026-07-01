"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  attachFieldToPage,
  createFieldDefinition,
  deleteFieldDefinition,
  detachFieldFromPage,
  setPageFieldValue,
  updateFieldDefinition,
} from "@/app/actions/page-fields";
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ORDER,
  type PageFieldDefinition,
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
  Hash,
  Plus,
  Tags,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const TYPE_ICON: Record<PageFieldType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: Tags,
  checkbox: CheckSquare,
};

interface PagePropertiesProps {
  pageId: string;
  /** Fields attached to this page (a value row exists), display-ordered. */
  fields: PageFieldWithValue[];
  /** Every field definition the user has, for the add-property picker. */
  definitions: PageFieldDefinition[];
  /** Invalidate the pages + definitions queries after any mutation. */
  onChanged: () => void;
}

/**
 * Issue #165 — Notion-style custom properties block for a wiki page. Renders the
 * page's attached fields with a per-type editor, plus an "+ Add property" picker
 * that attaches an existing reusable field or creates a new one. All persistence
 * flows through the page-fields server actions; onChanged re-syncs the queries.
 */
export function PageProperties({ pageId, fields, definitions, onChanged }: PagePropertiesProps) {
  // Collapsed by default so the block never crowds the page (Notion tucks
  // properties behind a toggle). The neumorphic panel only appears on expand.
  const [expanded, setExpanded] = useState(false);

  async function persistValue(fieldDefinitionId: string, value: PageFieldValue) {
    await setPageFieldValue({ pageId, fieldDefinitionId, value });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group/pt flex items-center gap-1 w-fit px-1 py-0.5 rounded text-[11px] font-mono uppercase tracking-wide text-[var(--ink-muted)] opacity-60 hover:opacity-100 hover:text-[var(--ink)] transition-all duration-150 cursor-pointer"
      >
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          className={cn("transition-transform duration-200", expanded && "rotate-90")}
        />
        <span>Properties</span>
        {fields.length > 0 && (
          <span className="text-[10px] text-[var(--ink-muted)] opacity-80">{fields.length}</span>
        )}
      </button>

      {expanded && (
        <div className="glass-tile rounded-xl px-2 py-1.5 flex flex-col gap-0.5">
          {fields.map((field) => (
            <FieldRow
              key={field.id}
              pageId={pageId}
              field={field}
              onSave={(value) => persistValue(field.id, value)}
              onChanged={onChanged}
            />
          ))}
          <AddPropertyControl
            pageId={pageId}
            attachedIds={new Set(fields.map((f) => f.id))}
            definitions={definitions}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}

// ─── A single attached field: label + type menu + value editor ────────────────

function FieldRow({
  pageId,
  field,
  onSave,
  onChanged,
}: {
  pageId: string;
  field: PageFieldWithValue;
  onSave: (value: PageFieldValue) => Promise<void>;
  onChanged: () => void;
}) {
  const Icon = TYPE_ICON[field.type];
  return (
    <div className="group flex items-center gap-1.5 min-h-[34px] rounded-lg px-1 hover:bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)] transition-colors duration-150">
      <FieldLabelMenu pageId={pageId} field={field} onChanged={onChanged} icon={Icon} />
      <div className="flex-1 min-w-0 self-center">
        <FieldValueEditor field={field} onSave={onSave} onChanged={onChanged} />
      </div>
    </div>
  );
}

function FieldLabelMenu({
  pageId,
  field,
  onChanged,
  icon: Icon,
}: {
  pageId: string;
  field: PageFieldWithValue;
  onChanged: () => void;
  icon: typeof Type;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(field.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setName(field.name);
  }, [field.name, open]);

  async function rename() {
    const next = name.trim();
    if (!next || next === field.name || busy) return;
    setBusy(true);
    try {
      await updateFieldDefinition({ id: field.id, name: next });
      onChanged();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function detach() {
    setBusy(true);
    try {
      await detachFieldFromPage({ pageId, fieldDefinitionId: field.id });
      onChanged();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteFieldDefinition(field.id);
      onChanged();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 shrink-0 self-center w-[128px] px-1.5 py-1 rounded-md text-left text-[12px] font-mono text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer"
          title={FIELD_TYPE_LABELS[field.type]}
        >
          <Icon size={12} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{field.name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5 flex flex-col gap-1" align="start">
        <div className="flex items-center gap-1 px-1 pb-1">
          <input
            // biome-ignore lint/a11y/noAutofocus: focus belongs in the just-opened rename input
            autoFocus
            type="text"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Property name"
            className="flex-1 min-w-0 px-2 py-1 text-[12px] font-mono bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={rename}
            disabled={busy}
            title="Rename"
            className="shrink-0 flex items-center justify-center w-6 h-6 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Check size={12} strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wide text-[var(--ink-muted)]">
          {FIELD_TYPE_LABELS[field.type]}
        </div>
        <div className="h-px bg-[var(--edge)]" />
        <button
          type="button"
          onClick={detach}
          disabled={busy}
          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm text-[12px] font-serif text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-100 cursor-pointer disabled:opacity-50"
        >
          <X size={12} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
          Remove from page
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Deletes this field from every page"
          className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm text-[12px] font-serif text-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--ink-coral)] transition-colors duration-100 cursor-pointer disabled:opacity-50"
        >
          <Trash2 size={12} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
          Delete field everywhere
        </button>
      </PopoverContent>
    </Popover>
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
      // Select the freshly created option (single-select replaces).
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
      <PopoverContent className="w-60 p-1.5 flex flex-col gap-1" align="start">
        <div className="flex items-center gap-1 px-1 pb-1">
          <input
            // biome-ignore lint/a11y/noAutofocus: focus belongs in the just-opened option input
            autoFocus
            type="text"
            value={newLabel}
            disabled={busy}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createOption();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search or create…"
            className="flex-1 min-w-0 px-2 py-1 text-[12px] font-sans bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-0.5 max-h-[240px] overflow-y-auto">
          {options
            .filter((o) => o.label.toLowerCase().includes(newLabel.trim().toLowerCase()))
            .map((o) => {
              const isSelected = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="flex items-center gap-2 w-full text-left px-1.5 py-1 rounded-sm hover:bg-[var(--surface)] transition-colors duration-100 cursor-pointer"
                >
                  <span className="flex-1 min-w-0">
                    <TagChip option={o} />
                  </span>
                  {isSelected && (
                    <Check size={12} strokeWidth={2} className="text-[var(--ink)] shrink-0" />
                  )}
                </button>
              );
            })}
          {newLabel.trim() &&
            !options.some((o) => o.label.toLowerCase() === newLabel.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={createOption}
                disabled={busy}
                className="flex items-center gap-2 w-full text-left px-1.5 py-1 rounded-sm text-[12px] font-serif text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer disabled:opacity-50"
              >
                <Plus size={12} strokeWidth={1.5} />
                Create “{newLabel.trim()}”
              </button>
            )}
          {options.length === 0 && !newLabel.trim() && (
            <p className="px-2 py-1.5 text-[12px] font-serif italic text-[var(--ink-muted)]">
              Type to create an option.
            </p>
          )}
        </div>
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

// ─── Add-property picker: attach an existing field or create a new one ─────────

function AddPropertyControl({
  pageId,
  attachedIds,
  definitions,
  onChanged,
}: {
  pageId: string;
  attachedIds: Set<string>;
  definitions: PageFieldDefinition[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PageFieldType>("text");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const available = definitions.filter((d) => !attachedIds.has(d.id));
  const filtered = available.filter((d) =>
    d.name.toLowerCase().includes(name.trim().toLowerCase()),
  );
  const canCreate =
    name.trim().length > 0 &&
    !definitions.some((d) => d.name.toLowerCase() === name.trim().toLowerCase());

  function reset() {
    setName("");
    setType("text");
  }

  async function attach(fieldDefinitionId: string) {
    setBusy(true);
    try {
      await attachFieldToPage({ pageId, fieldDefinitionId });
      onChanged();
      setOpen(false);
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 w-fit pl-2.5 pr-2 py-1 rounded-md text-[12px] font-mono text-[var(--ink-muted)] opacity-70 hover:opacity-100 hover:text-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--surface-raised)_45%,transparent)] transition-all duration-150 cursor-pointer"
        >
          <Plus size={12} strokeWidth={1.5} className="shrink-0" />
          Add property
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5 flex flex-col gap-1" align="start">
        <input
          // biome-ignore lint/a11y/noAutofocus: focus belongs in the just-opened picker
          autoFocus
          ref={nameRef}
          type="text"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) void createWithType(type);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Find or create a property…"
          className="w-full px-2 py-1.5 text-[12px] font-mono bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] disabled:opacity-50"
        />

        {filtered.length > 0 && (
          <>
            <div className="px-2 pt-1 text-[10px] font-mono uppercase tracking-wide text-[var(--ink-muted)]">
              Existing
            </div>
            <div className="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto">
              {filtered.map((d) => {
                const Icon = TYPE_ICON[d.type];
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => attach(d.id)}
                    disabled={busy}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm text-[12px] font-serif text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-100 cursor-pointer disabled:opacity-50"
                  >
                    <Icon size={12} strokeWidth={1.5} className="text-[var(--ink-muted)] shrink-0" />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                      {FIELD_TYPE_LABELS[d.type]}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {canCreate && (
          <>
            <div className="px-2 pt-1 text-[10px] font-mono uppercase tracking-wide text-[var(--ink-muted)]">
              New property — pick a type
            </div>
            <div className="grid grid-cols-1 gap-0.5">
              {FIELD_TYPE_ORDER.map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setType(t);
                      // Defer create so setType is applied via the passed value.
                      void createWithType(t);
                    }}
                    disabled={busy}
                    className={cn(
                      "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm text-[12px] font-serif transition-colors duration-100 cursor-pointer disabled:opacity-50",
                      type === t
                        ? "bg-[var(--surface)] text-[var(--ink)]"
                        : "text-[var(--ink)] hover:bg-[var(--surface)]",
                    )}
                  >
                    <Icon size={12} strokeWidth={1.5} className="text-[var(--ink-muted)] shrink-0" />
                    <span className="flex-1">{FIELD_TYPE_LABELS[t]}</span>
                    <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                      Create “{name.trim()}”
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!canCreate && filtered.length === 0 && (
          <p className="px-2 py-1.5 text-[12px] font-serif italic text-[var(--ink-muted)]">
            {available.length === 0 && name.trim() === ""
              ? "Type a name to create a property."
              : "That name already exists."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );

  async function createWithType(t: PageFieldType) {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await createFieldDefinition({
        name: trimmed,
        type: t,
        ...(t === "select" ? { options: [] } : {}),
      });
      if (created.success) {
        await attachFieldToPage({ pageId, fieldDefinitionId: created.data.id });
      }
      onChanged();
      setOpen(false);
      reset();
    } finally {
      setBusy(false);
    }
  }
}
