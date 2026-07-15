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
 * Each fact card carries the §5d treatment (1px --edge left edge only +
 * --surface background + ambient --hud-cyan-glow-soft + mono chrome
 * metadata + serif body for the fact value). Card rendering lives in
 * MemoryTable.tsx which owns the realtime subscription + edit/delete UI.
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

export const dynamic = "force-dynamic";

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
            <h1 className="text-4xl font-semibold text-[var(--ink)]">
              Memory
            </h1>
            <p className="text-base text-[var(--ink-muted)]">
              What JARVIS remembers about you, your preferences, and your
              workflow.
            </p>
          </div>
          <Link
            href="/jarvis"
            className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 ease-out shrink-0 mt-2"
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
            <aside
              className="bg-[var(--surface)] px-4 py-3 flex items-center gap-3"
              style={{
                borderLeft: "1px solid var(--edge)",
                boxShadow: "0 0 24px var(--hud-cyan-glow-soft)",
              }}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                FACT · ledger
              </span>
              <span aria-hidden="true" className="text-[var(--ink-muted)]">
                ·
              </span>
              <span className="font-mono text-[11px] text-[var(--ink)]">
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
