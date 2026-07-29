"use client";

import { defineDockWidget } from "@/components/shell/cockpit/dock-registry";
import { type HomeLightDeviceView, formatLightMeta, swatchColor } from "@/lib/govee/home-display";
import { useHomeLightsState } from "@/lib/govee/useHomeLightsState";
import { Lightbulb } from "lucide-react";

/**
 * Home devices — light status at a glance.
 *
 * It reuses `useHomeLightsState`, the same hook and the same query key the
 * sidebar strip already polls, rather than opening a second path to the same
 * Govee data. Two subscribers, one request, one cache entry.
 *
 * A Govee outage surfaces here as this widget's own line. It does not take the
 * strip down: the Dock mounts every widget inside its own error boundary.
 */

type HomeDevicesData = {
  devices: HomeLightDeviceView[];
  connected: boolean;
  state: "loading" | "ready" | "error";
};

function useHomeDevices(): HomeDevicesData {
  const { data, isPending, isError } = useHomeLightsState();

  if (isPending) return { devices: [], connected: false, state: "loading" };
  if (isError || !data) {
    return { devices: [], connected: false, state: "error" };
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

  return { devices, connected: data.connected, state: "ready" };
}

function statusLine(light: HomeLightDeviceView, connected: boolean): string {
  if (light.stateError) return "Unreachable";
  if (!connected) return "Offline";
  if (light.on === true) {
    const meta = formatLightMeta(light);
    return meta ? `On · ${meta}` : "On";
  }
  if (light.on === false) return "Off";
  return "Connected";
}

function DeviceRow({
  light,
  connected,
}: {
  light: HomeLightDeviceView;
  connected: boolean;
}) {
  const isOn = light.on === true;
  const swatch = swatchColor(light);

  return (
    <div className="flex h-8 min-w-0 items-center gap-2 px-1.5">
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
      <span className="min-w-0 flex-1 truncate text-meta text-[var(--ink)]">{light.name}</span>
      <span
        className={
          isOn
            ? "shrink-0 truncate rounded-full bg-[var(--tint-bg,var(--hover))] px-1.5 py-0.5 text-micro font-medium text-[var(--tint-ink,var(--ink-muted))]"
            : "shrink-0 truncate text-micro text-[var(--ink-faint)]"
        }
      >
        {statusLine(light, connected)}
      </span>
    </div>
  );
}

function Compact({ data }: { data: HomeDevicesData }) {
  if (data.state === "loading") {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">Checking…</p>;
  }
  if (data.state === "error") {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">Home is unreachable.</p>;
  }
  if (data.devices.length === 0) {
    return <p className="px-2 text-meta text-[var(--ink-faint)]">No devices registered.</p>;
  }

  return (
    <div className="flex flex-col">
      {data.devices.slice(0, 4).map((light) => (
        <DeviceRow key={light.deviceId} light={light} connected={data.connected} />
      ))}
    </div>
  );
}

function Expanded({ data }: { data: HomeDevicesData }) {
  if (data.state !== "ready" || data.devices.length === 0) {
    return <Compact data={data} />;
  }
  return (
    <div className="flex flex-col">
      {data.devices.map((light) => (
        <DeviceRow key={light.deviceId} light={light} connected={data.connected} />
      ))}
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
