/**
 * /settings/routines — author and manage JARVIS routines.
 *
 * A routine = one-or-more triggers → an ordered sequence of agentic "blocks".
 * This page is the intuitive, comprehensive authoring surface: a list of the
 * user's routines plus a full-page editor (trigger builder + drag-reorderable
 * block list + per-block NL directive).
 *
 * Server Component pattern mirrors /settings/mcp-tokens and /settings/memory:
 *   - requireOnboarded() for auth
 *   - a server-side prefetch of the routines list for instant first paint
 *   - plain JSON-serializable props down to the "use client" island
 *
 * Reads/writes go through the merged routine-model server actions in
 * app/actions/routines.ts; the client wires them into TanStack Query.
 */

import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/get-user";
import { listRoutines } from "@/app/actions/routines";
import type { Routine } from "@hyperpolymath/jarvis-core";
import { RoutinesClient } from "./RoutinesClient";

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  const user = await requireOnboarded();

  // Prefetch for SSR initial data. If it fails, hand the client an empty list
  // and let TanStack Query surface the error on refetch — never blow up the page.
  const res = await listRoutines();
  const initialRoutines: Routine[] = res.success ? res.data : [];

  return (
    <main className="relative min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[860px] px-6 md:px-10 pt-10 pb-16">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Settings · Routines
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-[var(--ink)]">
              Routines
            </h1>
            <p className="mt-3 font-serif text-[16px] leading-[1.55] text-[var(--ink-muted)]">
              Give JARVIS a trigger and an ordered list of smart blocks. When the
              trigger fires — a wake phrase, a time of day, a hotkey — JARVIS runs
              each block in turn, guided by the plain-English directive you write.
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 ease-out"
          >
            ← settings
          </Link>
        </header>

        <RoutinesClient userId={user.id} initialRoutines={initialRoutines} />
      </div>
    </main>
  );
}
