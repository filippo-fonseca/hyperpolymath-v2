"use client";

/**
 * Bottom-sidebar HOME strip — wifi + nicknames + live state for lights that are ON.
 * Slotted under SidebarStatusRow (§1.5 ambient status).
 */

import Link from "next/link";
import { Wifi, WifiOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatLightMeta,
  swatchColor,
  type HomeLightDeviceView,
} from "@/lib/govee/home-display";
import { useHomeLightsState } from "@/lib/govee/useHomeLightsState";
import { cn } from "@/lib/utils";
import { SB_FOCUS } from "./Sidebar";

interface Props {
  collapsed: boolean;
}

function sortActiveFirst(devices: HomeLightDeviceView[]): HomeLightDeviceView[] {
  return [...devices].sort((a, b) => {
    const aOn = a.on === true ? 0 : 1;
    const bOn = b.on === true ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function DeviceRow({ light }: { light: HomeLightDeviceView }) {
  const swatch = swatchColor(light);
  const meta = formatLightMeta(light);
  const isOn = light.on === true;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-[6px] px-1 py-1",
        isOn ? "text-[var(--sd-ink)]" : "text-[var(--sd-ink-faint)]",
      )}
      title={light.stateError ? light.stateError : undefined}
    >
      <span
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-[var(--sd-line)]"
        style={{
          background: isOn
            ? (swatch ?? "color-mix(in oklch, var(--hud-cyan) 45%, transparent)")
            : "transparent",
          boxShadow: isOn
            ? "inset 0 0 0 1px color-mix(in oklch, var(--sd-ink) 8%, transparent)"
            : undefined,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium tracking-wide">{light.name}</div>
        {isOn && meta ? (
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
            {meta}
          </div>
        ) : !isOn ? (
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
            Off
          </div>
        ) : null}
      </div>
      {isOn ? (
        <span
          className="sd-dot sd-dot-active shrink-0"
          aria-label="On"
          title="On"
        />
      ) : null}
    </div>
  );
}

export function SidebarHomeDevicesStrip({ collapsed }: Props) {
  const { data, isLoading, isError } = useHomeLightsState();
  const devices = data ? sortActiveFirst(data.devices) : [];
  const onDevices = devices.filter((d) => d.on === true);
  const connected = data?.connected === true;
  const hasDevices = devices.length > 0;

  if (collapsed) {
    const label = !hasDevices
      ? "No home lights"
      : connected
        ? onDevices.length > 0
          ? `${onDevices.length} light${onDevices.length === 1 ? "" : "s"} on`
          : "Home lights off"
        : "Home lights offline";

    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/settings#govee-lights"
              aria-label={label}
              className={cn(
                SB_FOCUS,
                "relative mx-auto flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--sd-ink-dull)] transition-colors hover:text-[var(--sd-ink)]",
              )}
            >
              {connected ? (
                <Wifi size={13} strokeWidth={1.75} aria-hidden />
              ) : (
                <WifiOff size={13} strokeWidth={1.75} aria-hidden />
              )}
              {onDevices.length > 0 ? (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--hud-cyan)] px-0.5 font-mono text-[8px] font-semibold text-[var(--sd-sidebar)]"
                  aria-hidden
                >
                  {onDevices.length}
                </span>
              ) : null}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <section
      aria-label="Home lights"
      className="rounded-[8px] px-1 py-1.5"
      style={{
        background: "color-mix(in oklch, var(--sd-hover) 55%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--sd-line) 70%, transparent)",
      }}
    >
      <div className="mb-1 flex items-center gap-1.5 px-1">
        {connected ? (
          <Wifi
            size={11}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--hud-cyan)]"
            aria-hidden
          />
        ) : (
          <WifiOff
            size={11}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--sd-ink-faint)]"
            aria-hidden
          />
        )}
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
          Home
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
          {isLoading
            ? "…"
            : isError
              ? "err"
              : connected
                ? onDevices.length > 0
                  ? `${onDevices.length} on`
                  : hasDevices
                    ? "all off"
                    : "—"
                : "offline"}
        </span>
      </div>

      {!hasDevices && !isLoading ? (
        <Link
          href="/settings#govee-lights"
          className={cn(
            SB_FOCUS,
            "block truncate px-1 py-1 text-[11px] text-[var(--sd-ink-dull)] underline-offset-2 hover:text-[var(--sd-ink)] hover:underline",
          )}
        >
          {data?.hint ?? "Add lights in Settings"}
        </Link>
      ) : null}

      {hasDevices ? (
        <div className="max-h-[7.5rem] space-y-0.5 overflow-y-auto">
          {(onDevices.length > 0 ? onDevices : devices.slice(0, 3)).map((light) => (
            <DeviceRow key={light.deviceId} light={light} />
          ))}
          {onDevices.length === 0 && devices.length > 3 ? (
            <div className="px-1 font-mono text-[10px] text-[var(--sd-ink-faint)]">
              +{devices.length - 3} more
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
