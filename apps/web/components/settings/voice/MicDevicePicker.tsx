"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Phase 7 Plan 07-02 — Mic device picker for Settings → Voice.
 *
 * Lists audioinput devices from navigator.mediaDevices.enumerateDevices().
 * Validates that any persisted micDeviceId still exists in the current
 * device list on every mount and after any devicechange event
 * (CRITICAL_PHASE7_CONCERNS #9 — device may have been unplugged).
 *
 * Per D-02 and 07-CONTEXT.md §"Claude's Discretion": standard <select>
 * element, not a bespoke picker. Mic device selection is functional chrome,
 * not agent surface — diplomatic register applies.
 */

interface Props {
  /** Currently persisted device ID (null means "browser default"). */
  value: string | null;
  /** Called when selection changes, including when a stale deviceId is reset. */
  onChange: (deviceId: string | null) => void;
  /** Disable when voice is not enabled. */
  disabled?: boolean;
}

export function MicDevicePicker({ value, onChange, disabled }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter((d) => d.kind === "audioinput");
        setDevices(inputs);

        // CRITICAL_PHASE7_CONCERNS #9 — validate that the persisted deviceId
        // still exists in the current device list. If it does not (e.g., the
        // user unplugged their USB mic), reset to null (browser default) so
        // the listener doesn't silently fail to open the correct stream.
        if (value && !inputs.some((d) => d.deviceId === value)) {
          console.warn(
            "[voice] persisted micDeviceId no longer present; resetting to default",
          );
          onChange(null);
        }
      } catch (err) {
        console.warn("[voice] enumerateDevices failed", err);
      }
    }

    void load();

    // Re-enumerate if OS-level device list changes (plug/unplug).
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener("devicechange", load);
  }, [value, onChange]);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled || devices.length === 0}
      aria-label="Microphone device"
      className={cn(
        "w-full rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 py-2",
        "font-serif text-sm text-[var(--ink)]",
        "focus:outline-none focus:border-[var(--edge-hud)]",
        "transition-colors duration-150 ease-out",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      <option value="">Default microphone</option>
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
        </option>
      ))}
    </select>
  );
}
