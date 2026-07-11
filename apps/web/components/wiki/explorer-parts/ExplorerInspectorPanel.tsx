"use client";

import { MetaRow, MetaSection } from "@/components/wiki/explorer/InspectorShell";
import { PagePreviewThumb } from "@/components/wiki/preview/PagePreviewThumb";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { extractPreviewModel } from "@/lib/pages/preview";
import { format, formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";

export interface ExplorerInspectorPanelProps {
  items: ExplorerItem[];
  ancestryLabel: string;
  onOpen?: (item: ExplorerItem) => void;
  onRename?: (item: ExplorerItem) => void;
  onExport?: (item: ExplorerItem) => void;
  onDelete?: (item: ExplorerItem) => void;
}

export function ExplorerInspectorPanel({
  items,
  ancestryLabel,
  onOpen,
  onRename,
  onExport,
  onDelete,
}: ExplorerInspectorPanelProps) {
  if (items.length === 0) {
    return (
      <MetaSection>
        <div className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          No selection
        </div>
        <p className="mt-2 font-serif text-[0.85rem] leading-6 text-[var(--ink-muted)]">
          Pick a page or folder to inspect. Click a card, drag to select, or use the arrow keys.
        </p>
      </MetaSection>
    );
  }

  if (items.length > 1) {
    const pages = items.filter((it) => it.kind === "page").length;
    const folders = items.filter((it) => it.kind === "folder").length;
    return (
      <MetaSection title="Selection">
        <MetaRow label="Items" value={String(items.length)} />
        <MetaRow label="Pages" value={String(pages)} />
        <MetaRow label="Folders" value={String(folders)} />
      </MetaSection>
    );
  }

  const only = items[0];
  if (only.kind === "folder") {
    return (
      <MetaSection title="Folder">
        <FolderNameBanner label={only.folder.name} />
        <MetaRow label="Items" value={String(only.itemCount)} />
        <MetaRow label="Location" value={ancestryLabel || "Wiki"} />
        <QuickActions
          onOpen={onOpen ? () => onOpen(only) : undefined}
          onRename={onRename ? () => onRename(only) : undefined}
          onDelete={onDelete ? () => onDelete(only) : undefined}
        />
      </MetaSection>
    );
  }

  const preview = extractPreviewModel(only.page.contentJson, only.page.content);
  return (
    <div className="space-y-3">
      <PagePreviewThumb page={only.page} model={preview} size="inspector" />
      <MetaSection title="Page">
        <MetaRow label="Title" value={only.page.title || "Untitled"} />
        <MetaRow label="Kind" value={only.page.dailyDate ? "Daily page" : "Note"} />
        <MetaRow label="Location" value={ancestryLabel || "Wiki"} />
        <MetaRow label="Words" value={String(preview.wordCount)} />
        <MetaRow label="Updated" value={formatDistanceToNow(new Date(only.page.updatedAt), { addSuffix: true })} />
        <MetaRow label="Created" value={format(new Date(only.page.createdAt), "MMM d, yyyy")} />
        {only.page.projects.length > 0 ? (
          <MetaRow label="Projects" value={only.page.projects.map((p) => p.name).join(", ")} />
        ) : null}
      </MetaSection>
      <QuickActions
        onOpen={onOpen ? () => onOpen(only) : undefined}
        onRename={onRename ? () => onRename(only) : undefined}
        onExport={onExport ? () => onExport(only) : undefined}
        onDelete={onDelete ? () => onDelete(only) : undefined}
      />
    </div>
  );
}

function FolderNameBanner({ label }: { label: string }) {
  return (
    <div className="rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-darker-box)] px-2 py-2 text-[0.85rem] text-[var(--ink)]">
      {label}
    </div>
  );
}

function QuickActions({
  onOpen,
  onRename,
  onExport,
  onDelete,
}: {
  onOpen?: () => void;
  onRename?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}) {
  const actions: { label: string; onClick?: () => void; danger?: boolean }[] = [];
  if (onOpen) actions.push({ label: "Open", onClick: onOpen });
  if (onRename) actions.push({ label: "Rename", onClick: onRename });
  if (onExport) actions.push({ label: "Export", onClick: onExport });
  if (onDelete) actions.push({ label: "Delete", onClick: onDelete, danger: true });
  if (actions.length === 0) return null;

  return (
    <MetaSection title="Actions">
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={
              action.danger
                ? "rounded-[6px] border border-[var(--sd-line)] px-2.5 py-1 font-sans text-[0.72rem] text-[var(--ink-coral)] transition-colors duration-[120ms] hover:bg-[color-mix(in_oklch,var(--ink-coral)_14%,transparent)]"
                : "rounded-[6px] border border-[var(--sd-line)] px-2.5 py-1 font-sans text-[0.72rem] text-[var(--ink)] transition-colors duration-[120ms] hover:bg-[var(--sd-hover)]"
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    </MetaSection>
  );
}

/** Convenience for callers that just want the "no selection" state as a node. */
export function inspectorEmpty(): ReactNode {
  return <ExplorerInspectorPanel items={[]} ancestryLabel="" />;
}
