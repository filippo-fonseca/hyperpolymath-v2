import { headers } from "next/headers";
import { requireOnboarded } from "@/lib/auth/get-user";
import { HudCornerCrops } from "@/components/shared/HudCornerCrops";

/**
 * Phase 6.1 Plan 06.1-03: /health pure instrument panel (UI-SPEC §5c).
 *
 * The /api/health JSON contract is unchanged (UI-SPEC §14 carry-forward).
 * This page is the most spare surface in the app: no card chrome at all;
 * the data sits on --canvas directly, the only chrome is 4 viewport
 * corner crops and a single 1px --edge-hud hairline below the H1.
 *
 * Register-swap (UI-SPEC §4b): the H1 "System Health" is the only H1 in
 * the app rendered in JetBrains Mono italic 500 24px instead of EB
 * Garamond serif. This surface IS the JSON, made human.
 *
 * Service rows are flex containers with key column (mono dim, ~180px),
 * status pill column (dot glyph + lowercase status), and value column
 * (mono ink). Status pill uses ● for ok/down and ◌ for n/a per UI-SPEC
 * §5c + §12c.
 *
 * Cyan for ok, coral for down, muted for n/a per UI-SPEC §3f.
 *
 * Wrapped in .agent-mode-scope so focus-visible inside picks up
 * --ring-hud per UI-SPEC §11a.
 */
interface HealthBody {
  supabase: "ok" | "down";
  anthropic: "ok" | "down";
  google_calendar: "ok" | "down" | "n/a";
  checked_at: string;
}

async function fetchHealth(): Promise<HealthBody> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`;
  const res = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  return (await res.json()) as HealthBody;
}

interface StatusRowProps {
  serviceKey: string;
  status: "ok" | "down" | "n/a";
  value: string;
}

function StatusRow({ serviceKey, status, value }: StatusRowProps) {
  const dotGlyph = status === "n/a" ? "◌" : "●";
  const dotColor =
    status === "ok"
      ? "var(--sd-accent)"
      : status === "down"
        ? "var(--ink-coral)"
        : "var(--sd-ink-dull)";
  return (
    <div
      className="flex items-baseline gap-4 py-1 font-mono-stats text-xs"
      role="row"
      aria-label={`${serviceKey}: ${status}`}
    >
      <span className="w-48 text-[var(--sd-ink-dull)]">{serviceKey}</span>
      <span
        className="inline-flex items-center gap-2 w-24"
        style={{ color: dotColor }}
      >
        <span aria-hidden="true">{dotGlyph}</span>
        <span className="">{status}</span>
      </span>
      <span className="text-[var(--sd-ink)]">{value}</span>
    </div>
  );
}

export default async function HealthPage() {
  await requireOnboarded();
  const data = await fetchHealth();

  return (
    <div className="agent-mode-scope relative min-h-screen bg-[var(--sd-app)] px-6 py-12">
      <HudCornerCrops
        size={12}
        className="fixed inset-0 pointer-events-none z-0"
      />
      <main className="relative z-10 max-w-2xl mx-auto">
        {/* HUD-coded H1 — the only mono italic H1 in the app (UI-SPEC §4b). */}
        <h1 className="font-mono italic font-medium text-2xl text-[var(--sd-ink)]">
          System Health
        </h1>

        {/* 1px --edge-hud hairline separating heading from readout. */}
        <div
          className="h-px my-6"
          style={{ backgroundColor: "var(--sd-accent)" }}
          aria-hidden="true"
        />

        {/* JSON-styled readout. Braces are decorative. The /api/health route
            returns ok|down only (no latency in shape per UI-SPEC §14
            carry-forward); the value column renders status-derived copy
            until a future plan extends the route shape with latencyMs. */}
        <div className="font-mono">
          <span
            className="font-mono text-xs"
            style={{ opacity: 0.3 }}
            aria-hidden="true"
          >
            {"{"}
          </span>
          <div className="pl-4 my-2">
            <StatusRow
              serviceKey="supabase"
              status={data.supabase}
              value={data.supabase === "ok" ? "reachable" : "unreachable"}
            />
            <StatusRow
              serviceKey="anthropic"
              status={data.anthropic}
              value={data.anthropic === "ok" ? "reachable" : "unreachable"}
            />
            <StatusRow
              serviceKey="google_calendar"
              status={data.google_calendar}
              value="per-user OAuth"
            />
            <div
              className="flex items-baseline gap-4 py-1 font-mono-stats text-xs"
              role="row"
            >
              <span className="w-48 text-[var(--sd-ink-dull)]">checked_at</span>
              <span className="w-24" aria-hidden="true" />
              <span className="text-[var(--sd-ink)]">{data.checked_at}</span>
            </div>
          </div>
          <span
            className="font-mono text-xs"
            style={{ opacity: 0.3 }}
            aria-hidden="true"
          >
            {"}"}
          </span>
        </div>

        {/* Bottom rail — refresh hint per UI-SPEC §5c. */}
 <div className="mt-12 flex items-center gap-2 text-micro text-[var(--sd-ink-dull)] opacity-60">
          <span aria-hidden="true">╶──</span>
          <span>refresh ⌘R · serves at /api/health</span>
          <span aria-hidden="true">──╴</span>
        </div>
      </main>

      {/*
        TODO(phase 6.1.x): status-latch flash animation on /api/health change
        (240ms one-shot --hud-cyan-glow pulse on the affected row) per
        UI-SPEC §5c motion permission. Deferred — current rows render
        statically; the visual register and JSON readout shape are complete.
      */}
    </div>
  );
}
