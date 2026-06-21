"use client";

import { createPage, getPagesForCurrentUser } from "@/app/actions/pages";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, FileText, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  userId: string;
  projectId: string;
  /** SSR-hydrated page slice for this project. */
  initialPages: PageWithProjects[];
}

/**
 * Project-scoped pages surface. Same data model as /pages, filtered to pages
 * linked to THIS project. Reads from the canonical `["pages", userId]` key —
 * derived per-project locally — so a realtime echo from any surface lands here
 * for free. "+ New page" creates a page pre-linked to this project.
 */
export function ProjectPagesSection({ userId, projectId, initialPages }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(localStorage.getItem("project-pages-collapsed") === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("project-pages-collapsed", String(collapsed));
  }, [collapsed]);

  useTableSubscription("pages", userId);
  useTableSubscription("pages_projects", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });

  const { data: allPages = [] } = useQuery({
    queryKey: tableKey("pages", userId),
    queryFn: () => getPagesForCurrentUser(),
    initialData: initialPages,
  });

  const projectPages = useMemo(
    () => allPages.filter((p) => p.projects.some((proj) => proj.id === projectId)),
    [allPages, projectId]
  );

  async function handleNewPage() {
    if (creating) return;
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      const result = await createPage({
        id,
        title: "",
        content: "",
        projectIds: [projectId],
      });
      if (result.success) router.push(`/pages/${result.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="project-pages-body"
          className="group flex items-center gap-2 -ml-1 px-1 py-1 rounded-sm hover:bg-[var(--surface)] transition-colors cursor-pointer"
        >
          <span className="text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors">
            Pages
          </h2>
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
            ({projectPages.length})
          </span>
        </button>
        {!collapsed && (
          <button
            type="button"
            onClick={handleNewPage}
            disabled={creating}
            aria-busy={creating}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[12px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {creating ? (
              <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Plus size={12} strokeWidth={1.5} />
            )}
            <span>{creating ? "Creating…" : "New page"}</span>
          </button>
        )}
      </div>

      {!collapsed && (
        <div id="project-pages-body" className="flex flex-col gap-2">
          {projectPages.length === 0 ? (
            <EmptyPages />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--edge)]">
              {projectPages.map((page) => (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/pages/${page.id}`)}
                    className="w-full flex items-center gap-3 py-2 text-left hover:bg-[var(--surface)] px-2 rounded-sm transition-colors duration-100 cursor-pointer"
                  >
                    <span className="w-4 flex-shrink-0 text-center text-[14px] leading-none">
                      {page.emoji ? (
                        <span>{page.emoji}</span>
                      ) : (
                        <FileText size={14} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] font-serif text-[var(--ink)] truncate">
                      {page.title || (
                        <span className="text-[var(--ink-muted)] italic">Untitled page</span>
                      )}
                    </span>
                    <span className="flex-shrink-0 text-[11px] font-mono text-[var(--ink-muted)]">
                      {formatDistanceToNow(new Date(page.updatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyPages() {
  return (
    <div className="rounded-md border border-dashed border-[var(--edge)] px-5 py-6 text-center">
      <p className="font-serif italic text-[15px] text-[var(--ink-muted)]">
        No pages yet. Add one to keep notes, meeting logs, or reference docs for this project.
      </p>
    </div>
  );
}
