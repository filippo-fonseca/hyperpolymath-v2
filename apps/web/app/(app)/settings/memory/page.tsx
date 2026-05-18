/**
 * /settings/memory — JARVIS persistent memory management page.
 *
 * Phase 5.1 Plan 05.1-03 (D-M6 / JARVIS-18).
 *
 * Server component that loads the user's jarvis_facts and renders the
 * MemoryTable (client component with Realtime subscription for live updates
 * when JARVIS writes during an active turn).
 *
 * This is the "escape valve" (D-M6 spirit): the user can review, edit, or
 * delete what JARVIS has remembered about them. The main interaction is
 * still typing into JARVIS — this page is for corrections.
 */

import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getJarvisFactsForUser } from "@/lib/db/queries/jarvis-facts";
import { MemoryTable } from "@/components/settings/memory/MemoryTable";
import { Card } from "@/components/ui/card";

// force-dynamic so each visit re-runs getJarvisFactsForUser against the
// live DB (facts change as JARVIS learns during turns).
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const user = await requireOnboarded();
  const facts = await getJarvisFactsForUser(user.id);

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-serif">Memory</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Facts JARVIS remembers about you across sessions. Edit or remove
              anything that&apos;s wrong.
            </p>
          </div>
          <Link href="/settings" className="underline text-sm">
            Back to settings
          </Link>
        </header>

        <Card className="p-0 overflow-hidden">
          <MemoryTable userId={user.id} initialFacts={facts} />
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Facts are written when you tell JARVIS something about yourself, or
          when JARVIS notices a pattern. Nothing is ever inferred from capture
          content.
        </p>
      </div>
    </main>
  );
}
