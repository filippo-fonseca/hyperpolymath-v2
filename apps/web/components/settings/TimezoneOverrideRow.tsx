"use client";

/**
 * `TimezoneOverrideRow` — Settings dropdown for users.timezone.
 *
 * Phase 4 Plan 04-04 (D-08 override).
 *
 * Read from `Intl.supportedValuesOf("timeZone")` (native, ~600 IANA names).
 * The user's detected tz from `Intl.DateTimeFormat().resolvedOptions()`
 * lives next to the dropdown with a "Match detected" button (Pitfall 5
 * antidote — if you travel to London and your tz drifts, one click reverts
 * the persisted value to match the device).
 *
 * Why a Select with all ~600 zones (vs the curated common-tz list):
 *   - Filippo is a college student who may study abroad; a tight list
 *     wouldn't cover the long tail. Native Select on a 600-item list with
 *     a search affordance via the browser's typeahead is acceptable for an
 *     MVP. Phase 6 polish could swap to a Combobox with custom search.
 *
 * Why `Intl.supportedValuesOf` (vs hardcoding):
 *   - Native ECMAScript API (Node 18+, all modern browsers). Always
 *     up-to-date with IANA's release cycle. Avoids the maintenance burden
 *     of a hand-curated list.
 *
 * Persist path:
 *   - Re-uses `setTimezone` from gcal-calendars.ts (Plan 04-03 D-08 first-
 *     visit detection). One action, two callers — the first-visit effect
 *     in CalendarClient AND this Settings row.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { setTimezone } from "@/app/actions/gcal-calendars";

interface Props {
  currentTimezone: string | null;
}

// `Intl.supportedValuesOf` exists on Node 18+ and every browser that ships
// Intl. The TypeScript lib defs for `Intl.supportedValuesOf` may not be in
// every project's tsconfig (depends on `lib` settings); cast for safety.
function getSupportedTimezones(): string[] {
  try {
    const intlAny = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    if (typeof intlAny.supportedValuesOf === "function") {
      return intlAny.supportedValuesOf("timeZone").sort();
    }
  } catch {
    // Fall through to a minimal hardcoded list below.
  }
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
  ];
}

function detectBrowserTz(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function TimezoneOverrideRow({ currentTimezone }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const detected = useMemo(() => detectBrowserTz(), []);
  const all = useMemo(() => getSupportedTimezones(), []);

  const [value, setValue] = useState<string>(currentTimezone ?? detected ?? "UTC");

  const handleChange = (next: string) => {
    if (next === value) return;
    setValue(next);
    startTransition(async () => {
      const res = await setTimezone({ timezone: next });
      if (res.success) {
        toast.success(`Timezone updated to ${next}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to update timezone.");
      }
    });
  };

  const matchDetected = () => {
    if (!detected || detected === value) return;
    handleChange(detected);
  };

  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Timezone</div>
        <div className="text-xs text-muted-foreground">
          Used to render event times on the /calendar grid.
          {detected && detected !== value && (
            <>
              {" "}Detected: <span className="font-mono">{detected}</span>.
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {detected && detected !== value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={matchDetected}
            disabled={pending}
          >
            Match detected
          </Button>
        )}
        <Select value={value} onValueChange={handleChange} disabled={pending}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select a timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {all.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
