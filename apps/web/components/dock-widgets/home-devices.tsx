"use client";

import { setGoveeDevicePower } from "@/app/actions/govee-devices";
import { DockStateNote } from "@/components/dock-widgets/dock-state";
import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import {
  type HomeLightDeviceView,
  type HomeLightsReceiptView,
  formatLightMeta,
  swatchColor,
} from "@/lib/govee/home-display";
import { HOME_LIGHTS_QUERY_KEY, useHomeLightsState } from "@/lib/govee/useHomeLightsState";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/**
 * Home — lights you can actually flip from the dock.
 *
 * This widget absorbed the retired sidebar HOME strip: the wifi/cloud
 * indicator, the "N on · M linked" status, the on-first/default/alphabetical
 * sort, and the settings hint all live here now, plus the one thing the strip
 * never had — a per-light power switch.
 *
 * Control path: `setGoveeDevicePower` (server action → Govee cloud). The
 * toggle patches the shared `HOME_LIGHTS_QUERY_KEY` cache optimistically and
 * lets the existing 3s `/api/studio/home` poll confirm or correct; on action
 * failure it toasts and invalidates so the poll restores truth.
 *
 * A Govee outage surfaces as this widget's own line; the Dock's per-widget
 * error boundary keeps the rest of the strip alive.
 */

type HomeDevicesData = {
  devices: HomeLightDeviceView[];
  connected: boolean;
  hint: string | null;
  state: "loading" | "ready" | "error";
  toggle: (light: HomeLightDeviceView) => void;
};

function useHomeDevices(): HomeDevicesData {
  const { data, isPending, isError } = useHomeLightsState();
  const qc = useQueryClient();

  const toggle = (light: HomeLightDeviceView) => {
    const next = !(light.on === true);
    // Optimistic: flip in the shared cache the sidebar/dock/poll all read.
    qc.setQueryData<HomeLightsReceiptView>(HOME_LIGHTS_QUERY_KEY, (old) =>
      old
        ? {
            ...old,
            devices: old.devices.map((d) =>
              d.deviceId === light.deviceId ? { ...d, on: next } : d
            ),
          }
        : old
    );
    void setGoveeDevicePower(light.deviceId, next).then((res) => {
      if (!res.ok) {
        toast.error(res.error);
        qc.invalidateQueries({ queryKey: HOME_LIGHTS_QUERY_KEY });
      }
    });
  };

  if (isPending) return { devices: [], connected: false, hint: null, state: "loading", toggle };
  if (isError || !data) {
    return { devices: [], connected: false, hint: null, state: "error", toggle };
  }

  // On first, default first, then alphabetical: the light you are most likely
  // to be looking for is the one that is doing something.
  const devices = [...data.devices].sort((a, b) => {
    const aOn = a.on === true ? 0 : 1;
    const bOn = b.on === true ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { devices, connected: data.connected, hint: data.hint ?? null, state: "ready", toggle };
}

function statusLine(light: HomeLightDeviceView, connected: boolean): string {
  if (light.stateError) return "Unreachable";
  if (!connected) return "Offline";
  if (light.on === true) {
    const meta = formatLightMeta(light);
    return meta ? `On · ${meta}` : "On";
  }
  if (light.on === false) return "Connected · Off";
  return "Connected";
}

/** Wifi + linked/on tally — the sidebar strip's header, dock-sized. */
function ConnectionRow({ data }: { data: HomeDevicesData }) {
  const onCount = data.devices.filter((d) => d.on === true).length;
  const reachable = data.connected ? data.devices.filter((d) => !d.stateError).length : 0;
  const label = !data.connected
    ? "Offline"
    : data.devices.length === 0
      ? "Connected"
      : onCount > 0
        ? `${onCount} on · ${reachable} linked`
        : `${reachable} linked`;

  return (
    <div className="mb-1 flex items-center gap-1.5 px-1.5">
      {data.connected ? (
        <Wifi size={11} strokeWidth={2} className="shrink-0 text-[var(--tint-ink)]" aria-hidden />
      ) : (
        <WifiOff
          size={11}
          strokeWidth={2}
          className="shrink-0 text-[var(--ink-faint)]"
          aria-hidden
        />
      )}
      <span
        className={cn(
          "text-micro tabular-nums",
          data.connected ? "text-[var(--ink-muted)]" : "text-[var(--ink-faint)]"
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Tiny switch — the dock's control affordance. Track takes the widget tint. */
function PowerSwitch({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-full transition-colors duration-[160ms] ease-out cursor-pointer-always",
        on ? "bg-[var(--tint-edge)]" : "bg-[var(--edge-strong)] hover:bg-[var(--ink-faint)]",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 size-3 rounded-full bg-white shadow-[var(--shadow-card)] transition-[left] duration-[160ms] ease-out",
          on ? "left-3.5" : "left-0.5"
        )}
      />
    </button>
  );
}

function DeviceRow({ light, data }: { light: HomeLightDeviceView; data: HomeDevicesData }) {
  const isOn = light.on === true;
  const swatch = swatchColor(light);
  const controllable = data.connected && !light.stateError;

  return (
    <div
      className="flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
      title={light.stateError ?? undefined}
    >
      {/* Lit bulbs get a soft halo of their own color; off bulbs a quiet ring. */}
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={
          isOn
            ? {
                background: swatch ?? "var(--tint-butter-edge)",
                boxShadow: `0 0 0 3px color-mix(in srgb, ${swatch ?? "var(--tint-butter-edge)"} 22%, transparent)`,
              }
            : { border: "1.5px solid var(--edge-strong)" }
        }
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta text-[var(--ink)]">{light.name}</span>
        <span
          className={cn(
            "block truncate text-micro tabular-nums",
            controllable ? "text-[var(--ink-faint)]" : "text-[var(--ink-faint)] opacity-70"
          )}
        >
          {statusLine(light, data.connected)}
        </span>
      </span>
      <PowerSwitch
        on={isOn}
        disabled={!controllable}
        label={isOn ? `Turn ${light.name} off` : `Turn ${light.name} on`}
        onToggle={() => data.toggle(light)}
      />
    </div>
  );
}

function SettingsHint({ hint }: { hint: string | null }) {
  return (
    <Link
      href="/settings#govee-lights"
      className="block rounded-lg px-1.5 py-1 text-micro text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
    >
      {hint ?? "Add lights in Settings"}
    </Link>
  );
}

function Compact({ data }: { data: HomeDevicesData }) {
  if (data.state === "loading") {
    return <DockStateNote>Checking…</DockStateNote>;
  }
  if (data.state === "error") {
    return <DockStateNote>Home is unreachable.</DockStateNote>;
  }

  return (
    <div className="flex flex-col">
      <ConnectionRow data={data} />
      {data.devices.length === 0 ? (
        <SettingsHint hint={data.hint} />
      ) : (
        data.devices
          .slice(0, 4)
          .map((light) => <DeviceRow key={light.deviceId} light={light} data={data} />)
      )}
    </div>
  );
}

function Expanded({ data }: { data: HomeDevicesData }) {
  if (data.state !== "ready" || data.devices.length === 0) {
    return <Compact data={data} />;
  }
  return (
    <div className="flex flex-col">
      <ConnectionRow data={data} />
      {data.devices.map((light) => (
        <DeviceRow key={light.deviceId} light={light} data={data} />
      ))}
      <SettingsHint hint="Manage lights" />
    </div>
  );
}

export const homeDevicesWidget = defineDockWidget<HomeDevicesData>({
  id: "home-devices",
  title: "Home",
  defaultDocked: true,
  order: 30,
  useData: useHomeDevices,
  Compact,
  Expanded,
  icon: Lightbulb,
  tint: "tint-lavender",
});
