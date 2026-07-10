"use client";

import {
  EmptyState,
  ExplorerBreadcrumbs,
  ExplorerContextMenu,
  ExplorerContextMenuContent,
  ExplorerContextMenuItem,
  ExplorerContextMenuSeparator,
  ExplorerContextMenuShortcut,
  ExplorerContextMenuTrigger,
  ExplorerTopBar,
  InspectorShell,
  MetaRow,
  MetaSection,
  SelectionRubberBand,
  SortSelect,
  ViewToggle,
  type ExplorerSortValue,
  type ExplorerViewMode,
} from "@/components/wiki/explorer";
import { FolderIcon, PageIcon } from "@/components/wiki/icons";
import { Archive, Download, FilePlus, FolderPlus, Info, Pencil, Search, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

const lightVars = {
  "--canvas": "oklch(97% 0.005 75)",
  "--surface": "oklch(94% 0.008 75)",
  "--surface-raised": "oklch(99% 0.003 75)",
  "--ink": "oklch(22% 0.01 60)",
  "--ink-muted": "oklch(50% 0.01 60)",
  "--edge": "oklch(86% 0.008 75)",
  "--ink-amber": "oklch(70% 0.13 75)",
  "--ink-sage": "oklch(62% 0.09 145)",
  "--ink-coral": "oklch(63% 0.16 25)",
  "--hud-cyan": "oklch(72% 0.13 210)",
  "--sd-app": "hsl(235 15% 87%)",
  "--sd-box": "hsl(235 15% 82%)",
  "--sd-dark-box": "hsl(235 15% 85%)",
  "--sd-darker-box": "hsl(235 16% 89%)",
  "--sd-input": "hsl(235 15% 80%)",
  "--sd-line": "hsl(235 15% 77%)",
  "--sd-divider": "hsl(235 15% 95%)",
  "--sd-hover": "hsl(235 15% 81%)",
  "--sd-selected": "hsl(235 15% 76%)",
  "--sd-active": "hsl(235 15% 70%)",
  "--sd-menu": "hsl(235 15% 90%)",
  "--sd-menu-hover": "hsl(235 15% 70%)",
} as CSSProperties;

export function FoundationPreviewGallery() {
  const [view, setView] = useState<ExplorerViewMode>("grid");
  const [sort, setSort] = useState<ExplorerSortValue>("manual");
  const [inspectorOpen, setInspectorOpen] = useState(true);

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-6 py-6 text-[var(--ink)]">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Dev scaffolding
            </p>
            <h1 className="font-serif text-4xl leading-tight">Explorer Foundation Preview</h1>
          </div>
          <button
            type="button"
            onClick={() => setInspectorOpen((open) => !open)}
            className="flex h-8 items-center gap-2 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-3 font-sans text-[0.8rem] transition-colors duration-[120ms] ease-out hover:bg-[var(--sd-hover)]"
          >
            <Info size={14} strokeWidth={1.8} />
            Inspector
          </button>
        </header>

        <ThemeFrame title="Dark" className="dark">
          <PreviewSurface
            view={view}
            setView={setView}
            sort={sort}
            setSort={setSort}
            inspectorOpen={inspectorOpen}
          />
        </ThemeFrame>

        <ThemeFrame title="Light" style={lightVars}>
          <PreviewSurface
            view={view}
            setView={setView}
            sort={sort}
            setSort={setSort}
            inspectorOpen={inspectorOpen}
          />
        </ThemeFrame>
      </div>
    </main>
  );
}

function ThemeFrame({
  title,
  children,
  className,
  style,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={className} style={style}>
      <div className="overflow-hidden rounded-[10px] border border-[var(--sd-line)] bg-[var(--sd-app)] text-[var(--ink)] shadow-[0_18px_60px_hsl(235_15%_0%_/_0.24)]">
        <div className="flex h-9 items-center border-b border-[var(--sd-divider)] bg-[var(--sd-darker-box)] px-4 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          {title}
        </div>
        {children}
      </div>
    </section>
  );
}

function PreviewSurface({
  view,
  setView,
  sort,
  setSort,
  inspectorOpen,
}: {
  view: ExplorerViewMode;
  setView: (view: ExplorerViewMode) => void;
  sort: ExplorerSortValue;
  setSort: (sort: ExplorerSortValue) => void;
  inspectorOpen: boolean;
}) {
  return (
    <div className="flex h-[650px] min-h-0 bg-[var(--sd-app)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <ExplorerTopBar
          canGoBack
          canGoForward={false}
          breadcrumbs={
            <ExplorerBreadcrumbs
              segments={[
                { id: "wiki", label: "Wiki" },
                { id: "research", label: "Research" },
                { id: "systems", label: "Systems", current: true },
              ]}
            />
          }
          search={
            <label className="relative block">
              <Search size={14} strokeWidth={1.8} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
              <input
                aria-label="Search current folder"
                placeholder="Search"
                className="h-8 w-full rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] pl-8 pr-2 font-sans text-[0.8rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--hud-cyan)]"
              />
            </label>
          }
          controls={
            <>
              <SortSelect value={sort} onValueChange={setSort} />
              <ViewToggle value={view} onChange={setView} />
              <button type="button" aria-label="New folder" className="flex size-8 items-center justify-center rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--ink-muted)] transition-colors duration-[120ms] ease-out hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]">
                <FolderPlus size={15} strokeWidth={1.8} />
              </button>
              <button type="button" aria-label="New page" className="flex size-8 items-center justify-center rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--ink-muted)] transition-colors duration-[120ms] ease-out hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]">
                <FilePlus size={15} strokeWidth={1.8} />
              </button>
            </>
          }
        />

        <ExplorerContextMenu>
          <ExplorerContextMenuTrigger asChild>
            <div className="relative min-h-0 flex-1 overflow-hidden p-5">
              <SelectionRubberBand x={274} y={238} width={160} height={92} />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                <FolderTile name="Course Notes" meta="24 items" />
                <FolderTile name="Thesis Archive" meta="8 items" variant="open" dropTarget />
                <PageTile name="Field Synthesis" meta="Updated today" kind="note" selected />
                <PageTile name="Daily Review" meta="1,240 words" kind="daily" />
                <PageTile name="Reference Dossier" meta="Shared with projects" kind="doc" />
              </div>

              <div className="mt-6 overflow-hidden rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-dark-box)]">
                {["Field Synthesis", "Reference Dossier", "Daily Review"].map((name, index) => (
                  <div
                    key={name}
                    className="grid h-8 grid-cols-[1fr_92px_120px] items-center border-b border-[var(--sd-line)] px-3 font-sans text-[0.8rem] last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <PageIcon size={20} kind={index === 2 ? "daily" : index === 1 ? "doc" : "note"} />
                      <span className="truncate text-[var(--ink)]">{name}</span>
                    </div>
                    <span className="text-[0.7rem] text-[var(--ink-muted)]">{index === 2 ? "Daily" : "Page"}</span>
                    <span className="justify-self-end text-[0.7rem] text-[var(--ink-muted)]">Jul 10</span>
                  </div>
                ))}
              </div>

              <EmptyState
                icon={<FolderIcon size={72} variant="open" />}
                title="A quiet folder, ready for a first page."
                description="This state keeps the editorial voice outside dense Explorer chrome."
                action={
                  <button type="button" className="rounded-[6px] border border-[var(--hud-cyan)] px-3 py-1.5 text-[0.8rem] text-[var(--ink)]">
                    Create page
                  </button>
                }
                className="mt-6 rounded-[10px] border border-dashed border-[var(--sd-line)] bg-[var(--sd-dark-box)]"
              />
            </div>
          </ExplorerContextMenuTrigger>
          <ExplorerContextMenuContent>
            <ExplorerContextMenuItem>
              <Pencil size={14} />
              Rename
              <ExplorerContextMenuShortcut>Return</ExplorerContextMenuShortcut>
            </ExplorerContextMenuItem>
            <ExplorerContextMenuItem>
              <Archive size={14} />
              Move
              <ExplorerContextMenuShortcut>M</ExplorerContextMenuShortcut>
            </ExplorerContextMenuItem>
            <ExplorerContextMenuItem>
              <Download size={14} />
              Export
            </ExplorerContextMenuItem>
            <ExplorerContextMenuSeparator />
            <ExplorerContextMenuItem variant="destructive">
              <Trash2 size={14} />
              Delete
            </ExplorerContextMenuItem>
          </ExplorerContextMenuContent>
        </ExplorerContextMenu>
      </div>

      <InspectorShell
        open={inspectorOpen}
        header={
          <div>
            <div className="font-sans text-sm text-[var(--ink)]">Field Synthesis</div>
            <div className="mt-0.5 font-sans text-[0.7rem] text-[var(--ink-muted)]">Selected page</div>
          </div>
        }
      >
        <div className="mb-4 rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-dark-box)] p-4">
          <PageIcon size={72} kind="note" className="mx-auto" />
        </div>
        <MetaSection title="Details">
          <MetaRow label="Kind" value="Page" />
          <MetaRow label="Location" value="Wiki / Research" />
          <MetaRow label="Words" value="2,418" />
          <MetaRow label="Updated" value="Today" />
        </MetaSection>
        <MetaSection title="Projects">
          <MetaRow label="Linked" value="Systems" />
          <MetaRow label="Tags" value="#thinking" />
        </MetaSection>
      </InspectorShell>
    </div>
  );
}

function FolderTile({
  name,
  meta,
  variant = "closed",
  dropTarget = false,
}: {
  name: string;
  meta: string;
  variant?: "closed" | "open";
  dropTarget?: boolean;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-box)] p-4 font-sans transition-[background-color,border-color] duration-[120ms] ease-out hover:bg-[var(--sd-hover)]">
      <FolderIcon size={70} variant={variant} dropTarget={dropTarget} className="mx-auto" />
      <div className="mt-3 truncate text-[0.8rem] text-[var(--ink)]">{name}</div>
      <div className="mt-0.5 text-[0.7rem] text-[var(--ink-muted)]">{meta}</div>
    </div>
  );
}

function PageTile({
  name,
  meta,
  kind,
  selected = false,
}: {
  name: string;
  meta: string;
  kind: "note" | "daily" | "doc";
  selected?: boolean;
}) {
  return (
    <div
      className={`rounded-[8px] border bg-[var(--sd-box)] font-sans transition-[background-color,border-color] duration-[120ms] ease-out hover:bg-[var(--sd-hover)] ${
        selected ? "border-[var(--hud-cyan)] shadow-[0_0_0_1px_var(--hud-cyan)_inset]" : "border-[var(--sd-line)]"
      }`}
    >
      <div className="flex h-24 items-center justify-center border-b border-[var(--sd-line)] bg-[var(--sd-dark-box)]">
        <PageIcon size={58} kind={kind} />
      </div>
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        <PageIcon size={20} kind={kind} />
        <div className="min-w-0">
          <div className="truncate text-[0.8rem] text-[var(--ink)]">{name}</div>
          <div className="truncate text-[0.7rem] text-[var(--ink-muted)]">{meta}</div>
        </div>
      </div>
    </div>
  );
}
