"use client";

/**
 * PagesBackupSection — /settings control for the daily Pages (Wiki) backup to
 * Google Drive (issue #142).
 *
 * Three affordances:
 *   1. Enable / disable the DAILY automatic backup (per-user opt-out; the cron
 *      skips disabled users). A segmented on/off control matching the
 *      DistanceUnitToggle convention — no Switch primitive exists in the kit.
 *   2. A last-backup status line: timestamp + a colored dot + plain-English
 *      status (backed up / nothing to back up / connect Google / reconnect for
 *      Drive permission / failed).
 *   3. A "Back up now" button that runs the SAME export the cron runs for the
 *      current user, on demand, regardless of the enable flag.
 *
 * All three call Server Actions inside useTransition so the section stays
 * interactive, with sonner toasts for feedback. After a manual backup we
 * router.refresh() so the Server Component re-reads the persisted last-run
 * status (the action revalidates /settings, and refresh pulls it in).
 *
 * Tokens never touch the client: the actions run server-side and only return a
 * status enum + message.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  setPagesBackupEnabled,
  backupPagesNow,
} from "@/app/(app)/settings/backup-actions";
import type { PagesBackupSettings } from "@/lib/db/queries/pages-backup";
import type { PagesBackupStatus } from "@/lib/gdrive/run-backup";

interface Props {
  settings: PagesBackupSettings;
  /** Whether Google is connected at all, to steer the "connect" hint copy. */
  gcalConnected: boolean;
}

const STATUS_META: Record<
  PagesBackupStatus,
  { label: string; dotClass: string }
> = {
  ok: { label: "Backed up", dotClass: "bg-green-500" },
  skipped_empty: { label: "Nothing to back up yet", dotClass: "bg-neutral-400" },
  not_connected: {
    label: "Google not connected",
    dotClass: "bg-amber-500",
  },
  needs_drive_scope: {
    label: "Reconnect Google for Drive permission",
    dotClass: "bg-amber-500",
  },
  error: { label: "Last backup failed", dotClass: "bg-[var(--ink-coral)]" },
};

export function PagesBackupSection({ settings, gcalConnected }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [togglePending, startToggle] = useTransition();
  const [backupPending, startBackup] = useTransition();

  function handleToggle(next: boolean) {
    if (next === enabled) return;
    const previous = enabled;
    setEnabled(next); // optimistic
    startToggle(async () => {
      const r = await setPagesBackupEnabled(next);
      if (!r.success) {
        setEnabled(previous);
        toast.error(r.error);
        return;
      }
      toast(
        next
          ? "Daily Pages backup enabled."
          : "Daily Pages backup paused.",
      );
    });
  }

  function handleBackupNow() {
    startBackup(async () => {
      const r = await backupPagesNow();
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      if (r.status === "ok") {
        toast.success(r.message);
      } else if (r.status === "skipped_empty") {
        toast(r.message);
      } else {
        toast.error(r.message);
      }
      // Pull in the freshly-persisted last-run status.
      router.refresh();
    });
  }

  const meta = settings.lastStatus ? STATUS_META[settings.lastStatus] : null;
  const lastRunLabel = settings.lastRunAt
    ? formatDistanceToNow(settings.lastRunAt, { addSuffix: true })
    : null;

  const toggleOptions: ReadonlyArray<{ value: boolean; label: string }> = [
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];

  return (
    <div className="space-y-5">
      {/* Enable / disable the daily automatic backup */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-[var(--ink)]">
            Daily automatic backup
          </div>
          <div className="text-xs text-[var(--ink-muted)]">
            Exports every page as Markdown to a “Hyperpolymath Wiki Backups”
            folder in your Google Drive, once a day.
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Daily automatic backup"
          className="inline-flex shrink-0 rounded-md border border-[var(--edge)] bg-[var(--canvas)] p-0.5"
        >
          {toggleOptions.map((opt) => {
            const selected = opt.value === enabled;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={togglePending && !selected}
                onClick={() => handleToggle(opt.value)}
                className={`font-mono text-xs uppercase tracking-[0.08em] px-3 py-1.5 rounded-sm transition-colors duration-100 cursor-pointer-always disabled:opacity-50 ${
                  selected
                    ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--edge-hud)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Last-backup status line */}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-[var(--ink)]">
            Last backup
          </div>
          {meta && lastRunLabel ? (
            <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
              <span
                className={`h-2 w-2 rounded-full ${meta.dotClass}`}
                aria-hidden
              />
              <span>
                {meta.label} · {lastRunLabel}
              </span>
            </div>
          ) : (
            <div className="text-xs text-[var(--ink-muted)]">
              No backup has run yet.
            </div>
          )}
          {settings.lastStatus === "error" && settings.lastError ? (
            <div className="text-xs text-[var(--ink-coral)]">
              {settings.lastError}
            </div>
          ) : null}
          {!gcalConnected ? (
            <div className="text-xs text-amber-600">
              Connect Google in the Integrations section above to enable Drive
              backups.
            </div>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={backupPending}
          onClick={handleBackupNow}
          className="shrink-0"
        >
          {backupPending ? "Backing up…" : "Back up now"}
        </Button>
      </div>
    </div>
  );
}
