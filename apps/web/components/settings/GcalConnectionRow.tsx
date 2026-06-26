"use client";

/**
 * GcalConnectionRow — Settings page row for the Google Calendar connection.
 *
 * Phase 4 Plan 04-02 (SET-02, CAL-09).
 *
 * Renders three states:
 *   - "not_connected" → status dot + `<a href="/api/gcal/auth">Connect</a>`
 *   - "connected"     → status dot + Disconnect button (gated by AlertDialog)
 *   - "expired"       → reserved for future surface; renders as "Token expired"
 *                       and shows the Disconnect path so the user can reconnect.
 *
 * Two effects:
 *   1. On mount, surface `?gcal={denied|invalid_state|no_refresh_token}`
 *      from the URL as sonner toasts, then router.replace to strip the
 *      query so a refresh doesn't re-fire. NO "connected" branch here —
 *      the callback redirects to /calendar?gcal=connected on success,
 *      never to /settings (m-03 fix).
 *   2. Disconnect runs the Server Action inside a useTransition; on
 *      success, toast + router.refresh() so the Server Component re-reads
 *      the connection status.
 *
 * Connect button: a plain `<a>` (not `<Link>`) because /api/gcal/auth is
 * a Route Handler, not an App Router page — client-side navigation skips
 * Route Handlers, so we need a full-page redirect.
 */

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { disconnectGcal } from "@/app/actions/gcal-connection";
import type { GcalConnectionStatus } from "@/lib/db/queries/gcal-connection";

interface Props {
  status: GcalConnectionStatus;
}

const STATUS_COPY: Record<
  GcalConnectionStatus,
  { label: string; dotClass: string }
> = {
  connected: { label: "Connected", dotClass: "bg-green-500" },
  not_connected: { label: "Not connected", dotClass: "bg-neutral-400" },
  expired: { label: "Token expired", dotClass: "bg-amber-500" },
};

export function GcalConnectionRow({ status }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const params = useSearchParams();

  // Surface ?gcal= query params from the OAuth callback as toasts.
  // The callback redirects to /settings ONLY on error/cancel paths;
  // success lands at /calendar (handled by Plan 04-03's CalendarClient).
  useEffect(() => {
    const flag = params.get("gcal");
    if (!flag) return;

    if (flag === "denied") {
      toast.error("Google Calendar connection cancelled.");
    } else if (flag === "invalid_state") {
      toast.error("Connection failed: state mismatch. Try again.");
    } else if (flag === "no_refresh_token") {
      toast.error(
        "Google didn't return a refresh token. Disconnect & try again.",
      );
    }
    // NOTE (m-03 fix): no `connected` branch here — the OAuth callback
    // redirects to /calendar?gcal=connected on success, so the success
    // toast lives in CalendarClient (Plan 04-03), not here. Only
    // error/cancel paths land back at /settings.

    // Strip the query so a refresh doesn't re-fire the toast.
    router.replace("/settings");
  }, [params, router]);

  const handleDisconnect = () => {
    startTransition(async () => {
      const res = await disconnectGcal();
      if (res.success) {
        toast.success("Google Calendar disconnected.");
      } else {
        toast.error(res.error ?? "Failed to disconnect.");
      }
      // Force the Server Component to re-fetch the connection status.
      // /settings has no Realtime subscription on the users row today,
      // so this manual refresh is the cleanest path. If Plan 04-04
      // adds a Realtime listener for users.timezone cross-tab sync,
      // this becomes redundant-but-harmless.
      router.refresh();
    });
  };

  const meta = STATUS_COPY[status];

  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Google Calendar</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${meta.dotClass}`}
            aria-hidden
          />
          <span>{meta.label}</span>
        </div>
      </div>

      {status === "not_connected" ? (
        <Button asChild size="sm">
          <a href="/api/gcal/auth">Connect</a>
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              {pending ? (
                <>
                  <Spinner size={14} label="Disconnecting" />
                  Disconnecting…
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
              <AlertDialogDescription>
                Your events stay in Google Calendar. The /calendar tab will
                be unavailable until you reconnect. You can reconnect at any
                time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDisconnect}>
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
