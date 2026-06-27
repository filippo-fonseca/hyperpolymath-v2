"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

const LABEL_CLASS = "font-mono text-[11px] uppercase tracking-[0.06em]";

type TriggerState = "idle" | "pending" | "ok" | "error";

interface TriggerResult {
  message: string;
  detail?: string;
}

async function callTrigger(endpoint: string): Promise<TriggerResult> {
  const res = await fetch(endpoint, { method: "POST" });
  const body: unknown = await res.json().catch(() => null);
  const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

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

  const errMsg = typeof bodyObj.error === "string" ? bodyObj.error : `HTTP ${res.status}`;
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
        <div className="flex-1 min-w-0">
          <p className="font-serif text-sm text-[var(--ink)]">{label}</p>
          <p className="font-serif text-xs text-[var(--ink-muted)] leading-relaxed">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={fire}
          disabled={state === "pending"}
          className={cn(
            "shrink-0 cursor-pointer-always rounded px-3 py-1",
            LABEL_CLASS,
            "border transition-colors duration-150",
            state === "pending"
              ? "border-[var(--edge)] text-[var(--ink-muted)] opacity-50"
              : "border-[var(--edge)] text-[var(--ink-muted)] hover:border-[var(--hud-cyan)] hover:text-[var(--hud-cyan)]",
          )}
        >
          {state === "pending" ? "Running..." : "Run now"}
        </button>
      </div>
      {isOkOrError && result ? (
        <div
          className={cn(
            "rounded-sm px-3 py-2 font-serif text-xs leading-relaxed",
            state === "ok"
              ? "bg-[var(--surface-raised)] text-[var(--ink-muted)]"
              : "bg-[var(--surface-raised)] text-[var(--ink)]",
          )}
        >
          <span
            className={cn(
              LABEL_CLASS,
              "mr-2",
              state === "ok"
                ? "text-[var(--hud-cyan)]"
                : "text-[var(--ink)]",
            )}
          >
            {state === "ok" ? "ok" : "err"}
          </span>
          {result.message}
          {result.detail ? (
            <span className="block mt-1 text-[var(--ink-muted)]">
              {result.detail}
            </span>
          ) : null}
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
    <div className="rounded-md border border-[var(--edge)] bg-[var(--surface)] p-4">
      <h3 className={cn(LABEL_CLASS, "text-[var(--ink-muted)] mb-4")}>
        Manual triggers
      </h3>
      <div className="flex flex-col gap-5 divide-y divide-[var(--edge)]">
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
    </div>
  );
}
