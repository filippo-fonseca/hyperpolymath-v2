"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { DevPanel, DevPanelHeader, StatePill } from "./dev-chrome";

type TriggerState = "idle" | "pending" | "ok" | "error";

interface TriggerResult {
  message: string;
  detail?: string;
}

async function callTrigger(endpoint: string): Promise<TriggerResult> {
  const res = await fetch(endpoint, { method: "POST" });
  const body: unknown = await res.json().catch(() => null);
  const bodyObj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (res.ok) {
    if (endpoint.includes("captures-to-issues")) {
      const issued = typeof bodyObj.issued === "number" ? bodyObj.issued : 0;
      const skipped = typeof bodyObj.skipped === "number" ? bodyObj.skipped : 0;
      const errors = typeof bodyObj.errors === "number" ? bodyObj.errors : 0;
      return {
        message: `Done. ${issued} issued, ${skipped} skipped, ${errors} errors.`,
      };
    }
    const note = typeof bodyObj.note === "string" ? bodyObj.note : "";
    return { message: "Sentinel written.", detail: note || undefined };
  }

  const errMsg =
    typeof bodyObj.error === "string" ? bodyObj.error : `HTTP ${res.status}`;
  const detail = typeof bodyObj.detail === "string" ? bodyObj.detail : undefined;

  if (res.status === 501 && errMsg === "local_only") {
    return {
      message: "Local-only trigger.",
      detail:
        detail ??
        "KIWI_AUTODEV_REPO is not set in apps/web/.env.local. This button only works when Next.js runs on the same machine as the kiwi-autodev LaunchAgent.",
    };
  }

  if (res.status === 429) {
    return { message: "Rate limited. Try again in a minute." };
  }

  return { message: `Error: ${errMsg}`, detail };
}

function TriggerButton({
  label,
  description,
  endpoint,
}: {
  label: string;
  description: string;
  endpoint: string;
}) {
  const [state, setState] = useState<TriggerState>("idle");
  const [result, setResult] = useState<TriggerResult | null>(null);
  const [, startTransition] = useTransition();

  function fire() {
    if (state === "pending") return;
    setState("pending");
    setResult(null);
    startTransition(async () => {
      try {
        const r = await callTrigger(endpoint);
        setState("ok");
        setResult(r);
      } catch (err) {
        setState("error");
        setResult({
          message: "Request failed.",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  const isOkOrError = state === "ok" || state === "error";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-meta font-medium text-[var(--sd-ink)]">{label}</p>
          <p className="text-micro leading-relaxed text-[var(--sd-ink-dull)]">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={fire}
          disabled={state === "pending"}
          className={cn(
            "craft-chip shrink-0",
            state === "pending" ? "cursor-default opacity-50" : "cursor-pointer-always",
          )}
        >
          {state === "pending" ? "Running…" : "Run now"}
        </button>
      </div>
      {isOkOrError && result ? (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--edge)] bg-[var(--surface)] px-3 py-2">
          <StatePill tone={state === "ok" ? "accent" : "coral"}>
            {state === "ok" ? "ok" : "err"}
          </StatePill>
          <div className="min-w-0 flex-1 text-micro leading-relaxed text-[var(--sd-ink-dull)]">
            <span className="text-[var(--sd-ink)]">{result.message}</span>
            {result.detail ? (
              <span className="mt-1 block text-[var(--sd-ink-faint)]">
                {result.detail}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Owner-only panel that surfaces manual "run now" buttons for the two pipeline
 * steps that normally run on a schedule: the captures-to-issues extractor and
 * the local kiwi-autodev worker. Rendered inside DevelopmentTabPanel.
 */
export function ManualTriggerPanel() {
  return (
    <DevPanel>
      <DevPanelHeader eyebrow="Manual triggers" />
      <div className="mt-4 flex flex-col gap-5 divide-y divide-[var(--sd-line)]">
        <TriggerButton
          label="Captures to issues"
          description="Extract actionable captures tagged #hyperpolymath and file them as GitHub issues. Skips the once-per-day cron lock."
          endpoint="/api/dev/trigger-captures-to-issues"
        />
        <div className="pt-5">
          <TriggerButton
            label="Run kiwi-autodev"
            description="Write the sentinel file that tells the local LaunchAgent to fire its next kiwi-autodev run, bypassing the once-per-day lock. Requires KIWI_AUTODEV_REPO in apps/web/.env.local and only works when the Next.js server runs on the same machine as the LaunchAgent."
            endpoint="/api/dev/trigger-autodev"
          />
        </div>
      </div>
    </DevPanel>
  );
}
