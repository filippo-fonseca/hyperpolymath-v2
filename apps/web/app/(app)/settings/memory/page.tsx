/**
 * /settings/memory — JARVIS persistent memory management page.
 *
 * Phase 6.1 Plan 06.1-03: agent-adjacent treatment per UI-SPEC §5d.
 *
 * Axis score 7 (UI-SPEC §2b table) — HUD chrome around serif content.
 * Wrapped in .agent-mode-scope so focus-visible inside picks up
 * --ring-hud per UI-SPEC §11a; 4 viewport corner crops (12px legs,
 * breathing) frame the page; H1 stays serif 36px 600 "Memory" because
 * this is content-side, not the /health register-swap exception.
 *
 * jul-29 craft restyle: the fact cards and the ledger summary moved onto the
 * raised-white card ladder (see MemoryTable.tsx, which still owns the realtime
 * subscription + edit/delete UI). The corner crops and .agent-mode-scope stay:
 * they are the agent-adjacent register signal, not surface decoration.
 *
 * Carry-forward (UI-SPEC §14): the page is still a Server Component;
 * getJarvisFactsForUser query is untouched; MemoryTable is still the
 * client realtime-subscribed renderer.
 */

import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getJarvisFactsForUser } from "@/lib/db/queries/jarvis-facts";
import { MemoryTable } from "@/components/settings/memory/MemoryTable";
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";
import { EmptyState } from "@/components/shared/EmptyState";

export default async function MemoryPage() {
  const user = await requireOnboarded();
  const facts = await getJarvisFactsForUser(user.id);

  return (
    <div className="agent-mode-scope relative min-h-screen bg-[var(--canvas)] px-6 py-12">
      <HudCornerCrops
        size={12}
        className="fixed inset-0 pointer-events-none z-0"
      />
      <main className="relative z-10 max-w-2xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <h1 className="text-4xl font-semibold tracking-[-0.01em] text-[var(--ink)]">
              Memory
            </h1>
            <p className="text-base text-[var(--ink-muted)]">
              What JARVIS remembers about you, your preferences, and your
              workflow.
            </p>
          </div>
          <Link
            href="/jarvis"
            className="mt-2 inline-flex shrink-0 items-center rounded-lg border border-[var(--edge)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] transition-[color,border-color,background-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] hover:shadow-[var(--shadow-card)]"
          >
            ← jarvis
          </Link>
        </header>

        {facts.length === 0 ? (
          <EmptyState
            heading="Nothing remembered yet."
            body="JARVIS will start remembering things once you've had a few conversations."
          />
        ) : (
          <>
            {/* Memory ledger summary — uses the §5d FactCard chrome family
                (1px --edge left edge only + ambient --hud-cyan-glow-soft)
                so the page itself reads as a fact-card register. */}
            <aside className="flex items-center gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] px-4 py-3 shadow-[var(--shadow-card)]">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                FACT · ledger
              </span>
              <span aria-hidden="true" className="text-[var(--ink-faint)]">
                ·
              </span>
              <span className="tint-lavender rounded-md border border-[color-mix(in_srgb,var(--tint-edge)_50%,transparent)] bg-[var(--tint-bg)] px-2 py-[1px] font-mono text-[11px] text-[var(--tint-ink)]">
                {facts.length} remembered
              </span>
            </aside>
            <MemoryTable userId={user.id} initialFacts={facts} />
          </>
        )}
      </main>
    </div>
  );
}
