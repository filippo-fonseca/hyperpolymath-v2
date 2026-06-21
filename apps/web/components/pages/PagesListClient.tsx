"use client";

import { createPage, getPagesForCurrentUser } from "@/app/actions/pages";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { FileText, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  userId: string;
  initialPages: PageWithProjects[];
}

/**
 * /pages client island. Realtime-backed list of all user pages with local
 * text filter and "+ New page" creation.
 */
export function PagesListClient({ userId, initialPages }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);

  useTableSubscription("pages", userId);
  useTableSubscription("pages_projects", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });

  const { data: allPages = [] } = useQuery({
    queryKey: tableKey("pages", userId),
    queryFn: () => getPagesForCurrentUser(),
    initialData: initialPages,
  });

  const filtered = filter.trim()
    ? allPages.filter((p) => p.title.toLowerCase().includes(filter.trim().toLowerCase()))
    : allPages;

  async function handleNewPage() {
    if (creating) return;
    setCreating(true);
    try {
      // Generate a client-side UUID so the Realtime echo is a no-op
      const id = crypto.randomUUID();
      const result = await createPage({ id, title: "", content: "" });
      if (result.success) {
        router.push(`/pages/${result.data.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-mono text-[13px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          Pages
        </h1>
        <button
          type="button"
          onClick={handleNewPage}
          disabled={creating}
          aria-busy={creating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[13px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-wait"
        >
          {creating ? (
            <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Plus size={13} strokeWidth={1.5} />
          )}
          <span>{creating ? "Creating…" : "New page"}</span>
        </button>
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter by title..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-3 py-2 text-[13px] font-serif bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] transition-colors duration-150"
      />

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileText size={28} strokeWidth={1} className="text-[var(--ink-muted)] opacity-40" />
          <p className="text-[13px] font-serif text-[var(--ink-muted)]">
            {filter
              ? "No pages match that filter."
              : "No pages yet. Create one to keep notes, docs, or references."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--edge)]">
          {filtered.map((page) => (
            <li key={page.id}>
              <button
                type="button"
                onClick={() => router.push(`/pages/${page.id}`)}
                className="w-full flex items-start gap-3 py-3 text-left hover:bg-[var(--surface)] px-2 rounded-sm transition-colors duration-100 cursor-pointer"
              >
                {/* Emoji or icon */}
                <span className="mt-0.5 w-5 flex-shrink-0 text-center text-[15px] leading-none">
                  {page.emoji ? (
                    <span>{page.emoji}</span>
                  ) : (
                    <FileText size={15} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-serif text-[var(--ink)] truncate">
                    {page.title || (
                      <span className="text-[var(--ink-muted)] italic">Untitled page</span>
                    )}
                  </p>
                  {/* Project chips */}
                  {page.projects.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {page.projects.map((proj) => (
                        <span
                          key={proj.id}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[11px] font-mono tracking-wide text-[var(--ink-muted)] bg-[var(--surface)] border border-[var(--edge)]"
                        >
                          {proj.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <span className="flex-shrink-0 text-[11px] font-mono text-[var(--ink-muted)] mt-0.5">
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
  );
}
