import { requireOnboarded } from "@/lib/auth/get-user";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Phase 6 Plan 06-04: /health visual page (UI-SPEC §8d).
 *
 * Authenticated diagnostic surface. Fetches /api/health server-side
 * (relative URL via Next 16 fetch). Agent-mode visual treatment:
 * neumorphic Card tiles + JARVIS-blue passive glow on "ok" status pills.
 *
 * The public /api/health endpoint returns 'n/a' for google_calendar (no user
 * context on a public endpoint — RESEARCH §7); the visual page surfaces that
 * 'n/a' verbatim. A per-user gcal status surface lives on /settings.
 */
interface HealthBody {
  supabase: "ok" | "down";
  anthropic: "ok" | "down";
  google_calendar: "ok" | "down" | "n/a";
  checked_at: string;
}

async function fetchHealth(): Promise<HealthBody> {
  // Server-side fetch — use absolute origin from env or relative path.
  // Next 16 in Server Components: full URL required for fetch during SSR.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  // 503 is also a valid response — surface the body either way
  return (await res.json()) as HealthBody;
}

export default async function HealthPage() {
  await requireOnboarded();
  const health = await fetchHealth();

  const services: Array<{
    key: "supabase" | "anthropic" | "google_calendar";
    label: string;
  }> = [
    { key: "supabase", label: "Supabase" },
    { key: "anthropic", label: "Anthropic" },
    { key: "google_calendar", label: "Google Calendar" },
  ];

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-4xl font-serif font-semibold">System Health</h1>
        <p className="text-base font-serif text-muted-foreground">
          Live connectivity check across upstream services.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {services.map(({ key, label }) => {
          const status = health[key];
          const isOk = status === "ok";
          const isNa = status === "n/a";
          return (
            <Card
              key={key}
              className="p-6 gap-3"
              style={{
                boxShadow: "var(--shadow-nm-surface)",
                border: "none",
              }}
            >
              <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <span
                aria-label={`${label}: ${status}`}
                className={cn(
                  "inline-flex items-center self-start px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wide",
                  isOk &&
                    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 agent-glow-passive",
                  !isOk && !isNa && "bg-destructive/10 text-destructive",
                  isNa && "bg-muted text-muted-foreground",
                )}
              >
                {status}
              </span>
            </Card>
          );
        })}
      </section>

      <p className="text-xs font-mono text-muted-foreground">
        Checked at: {health.checked_at}
      </p>
    </main>
  );
}
