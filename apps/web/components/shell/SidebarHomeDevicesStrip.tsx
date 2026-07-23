"use client";

/**
 * Bottom-sidebar HOME strip — wifi + every registered light (on or off).
 * Off devices still read clearly as connected/reachable when Govee cloud is up.
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

function deviceStatusLine(
  light: HomeLightDeviceView,
  cloudConnected: boolean,
): { line: string; reachable: boolean } {
  if (light.stateError) {
    return { line: "Unreachable", reachable: false };
  }
  if (!cloudConnected) {
    return { line: "Offline", reachable: false };
  }
  if (light.on === true) {
    const meta = formatLightMeta(light);
    return { line: meta ? `On · ${meta}` : "On", reachable: true };
  }
  if (light.on === false) {
    return { line: "Connected · Off", reachable: true };
  }
  // Power unknown but device is registered + cloud key works.
  return { line: "Connected", reachable: true };
}

function DeviceRow({
  light,
  cloudConnected,
}: {
  light: HomeLightDeviceView;
  cloudConnected: boolean;
}) {
  const swatch = swatchColor(light);
  const isOn = light.on === true;
  const { line, reachable } = deviceStatusLine(light, cloudConnected);

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-[6px] px-1 py-1",
        reachable ? "text-[var(--sd-ink)]" : "text-[var(--sd-ink-dull)]",
      )}
      title={light.stateError ? light.stateError : undefined}
    >
      <span
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-[var(--sd-line)]"
        style={{
          background: isOn
            ? (swatch ?? "color-mix(in oklch, var(--hud-cyan) 45%, transparent)")
            : reachable
              ? "color-mix(in oklch, var(--sd-ink-dull) 18%, transparent)"
              : "transparent",
          boxShadow: isOn
            ? "inset 0 0 0 1px color-mix(in oklch, var(--sd-ink) 8%, transparent)"
            : reachable
              ? "inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 22%, transparent)"
              : undefined,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium tracking-wide">{light.name}</div>
        <div
          className={cn(
            "truncate font-mono text-[10px] uppercase tracking-[0.08em]",
            reachable ? "text-[var(--sd-ink-dull)]" : "text-[var(--sd-ink-faint)]",
          )}
        >
          {line}
        </div>
      </div>
      {reachable ? (
        <span
          className={cn("sd-dot shrink-0", isOn ? "sd-dot-active" : "sd-dot-synced")}
          aria-label={isOn ? "On" : "Connected"}
          title={isOn ? "On" : "Connected"}
        />
      ) : (
        <span className="sd-dot sd-dot-idle shrink-0" aria-label="Offline" title="Offline" />
      )}
    </div>
  );
}

export function SidebarHomeDevicesStrip({ collapsed }: Props) {
  const { data, isLoading, isError } = useHomeLightsState();
  const devices = data ? sortActiveFirst(data.devices) : [];
  const onDevices = devices.filter((d) => d.on === true);
  const connected = data?.connected === true;
  const hasDevices = devices.length > 0;
  const reachableCount = connected
    ? devices.filter((d) => !d.stateError).length
    : 0;

  if (collapsed) {
    const label = !hasDevices
      ? "No home lights"
      : connected
        ? onDevices.length > 0
          ? `${onDevices.length} on · ${reachableCount} connected`
          : `${reachableCount} light${reachableCount === 1 ? "" : "s"} connected`
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
                connected && hasDevices && "text-[var(--hud-cyan)]",
              )}
            >
              {connected ? (
                <Wifi size={13} strokeWidth={1.75} aria-hidden />
              ) : (
                <WifiOff size={13} strokeWidth={1.75} aria-hidden />
              )}
              {hasDevices && connected ? (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--hud-cyan)] px-0.5 font-mono text-[8px] font-semibold text-[var(--sd-sidebar)]"
                  aria-hidden
                >
                  {onDevices.length > 0 ? onDevices.length : reachableCount}
                </span>
              ) : null}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const headerStatus = isLoading
    ? "…"
    : isError
      ? "err"
      : connected
        ? onDevices.length > 0
          ? `${onDevices.length} on · ${reachableCount} linked`
          : hasDevices
            ? `${reachableCount} linked`
            : "—"
        : "offline";

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
          {headerStatus}
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
        <div className="max-h-[9rem] space-y-0.5 overflow-y-auto">
          {devices.map((light) => (
            <DeviceRow key={light.deviceId} light={light} cloudConnected={connected} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
