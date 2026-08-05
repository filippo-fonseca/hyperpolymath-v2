"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { MetaRow, MetaSection } from "@/components/ui/explorer";
import { FolderIcon } from "@/components/ui/icons/FolderIcon";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { PagePreviewThumb } from "@/components/wiki/preview/PagePreviewThumb";
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
      <EmptyState
        size="section"
        title="Nothing selected"
        description="Select a page or folder to inspect it."
      />
    );
  }

  if (items.length > 1) {
    const pages = items.filter((it) => it.kind === "page").length;
    const folders = items.filter((it) => it.kind === "folder").length;
    return (
      <InspectorCard>
        <div className="grid aspect-square place-items-center bg-[var(--sd-dark-box)]">
          <div className="relative">
            <FolderIcon size={100} />
            <span className="absolute -bottom-1 -right-1 grid min-w-7 place-items-center rounded-full bg-[var(--sd-accent)] px-2 py-1 text-[0.75rem] font-semibold text-white">
              {items.length}
            </span>
          </div>
        </div>
        <MetaSection title="Details">
          <MetaRow label="Items" value={String(items.length)} />
          <MetaRow label="Pages" value={String(pages)} />
          <MetaRow label="Folders" value={String(folders)} />
        </MetaSection>
      </InspectorCard>
    );
  }

  const only = items[0];
  if (only.kind === "folder") {
    return (
      <InspectorCard>
        <div className="grid aspect-square place-items-center bg-[var(--sd-dark-box)]">
          <FolderIcon size={132} variant="open" />
        </div>
        <InspectorName name={only.folder.name} kind="Folder" />
        <QuickActions
          onOpen={onOpen ? () => onOpen(only) : undefined}
          onRename={onRename ? () => onRename(only) : undefined}
          onDelete={onDelete ? () => onDelete(only) : undefined}
        />
        <Divider />
        <MetaSection title="Details">
          <MetaRow label="Items" value={String(only.itemCount)} />
          <MetaRow label="Location" value={ancestryLabel || "Wiki"} />
        </MetaSection>
      </InspectorCard>
    );
  }

  const preview = extractPreviewModel(only.page.contentJson, only.page.content);
  return (
    <InspectorCard>
      <div className="aspect-square bg-[var(--sd-dark-box)] p-2">
        <PagePreviewThumb
          page={only.page}
          model={preview}
          size="inspector"
          className="h-full shadow-md"
        />
      </div>
      <InspectorName name={only.page.title || "Untitled"} kind="Page" />
      <QuickActions
        onOpen={onOpen ? () => onOpen(only) : undefined}
        onRename={onRename ? () => onRename(only) : undefined}
        onExport={onExport ? () => onExport(only) : undefined}
        onDelete={onDelete ? () => onDelete(only) : undefined}
      />
      <Divider />
      <MetaSection title="Details">
        <MetaRow label="Kind" value="Page" />
        <MetaRow label="Location" value={ancestryLabel || "Wiki"} />
        <MetaRow label="Words" value={String(preview.wordCount)} />
        {only.page.projects.length > 0 ? (
          <MetaRow label="Projects" value={only.page.projects.map((p) => p.name).join(", ")} />
        ) : null}
      </MetaSection>
      <Divider />
      <MetaSection title="Dates">
        <MetaRow
          label="Modified"
          value={formatDistanceToNow(new Date(only.page.updatedAt), { addSuffix: true })}
        />
        <MetaRow label="Created" value={format(new Date(only.page.createdAt), "MMM d, yyyy")} />
      </MetaSection>
    </InspectorCard>
  );
}

function InspectorCard({ children }: { children: ReactNode }) {
  // aug-04 craft-ui-v2: the inspector's one card joins the register.
  return <div className="craft-card overflow-hidden rounded-xl">{children}</div>;
}

function InspectorName({ name, kind }: { name: string; kind: string }) {
  return (
    <div className="px-4 pb-1 pt-3">
      <div className="truncate text-subtitle font-medium text-[var(--sd-ink)]">{name}</div>
      <span className="mt-1 inline-flex rounded bg-[var(--sd-selected)] px-1 py-0.5 text-micro font-medium text-[var(--sd-ink-dull)]">
        {kind}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]" />;
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
    <div className="px-3 py-2">
      <div className="flex flex-wrap gap-1">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={
              action.danger
                ? "rounded-lg px-2 py-1 font-sans text-micro text-[var(--ink-coral)] transition-colors duration-[160ms] hover:bg-[color-mix(in_oklch,var(--ink-coral)_14%,transparent)]"
                : "rounded-lg px-2 py-1 font-sans text-micro text-[var(--sd-ink-dull)] transition-colors duration-[160ms] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Convenience for callers that just want the "no selection" state as a node. */
export function inspectorEmpty(): ReactNode {
  return <ExplorerInspectorPanel items={[]} ancestryLabel="" />;
}
