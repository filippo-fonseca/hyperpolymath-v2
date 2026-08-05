"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import {
  type GoveeDeviceRow,
  removeGoveeDevice,
  renameGoveeDevice,
  setDefaultGoveeDevice,
  syncGoveeDevices,
} from "@/app/actions/govee-devices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  initialDevices: GoveeDeviceRow[];
  hasApiKey: boolean;
}

type DevicesUpdater = React.Dispatch<React.SetStateAction<GoveeDeviceRow[]>>;

export function GoveeDevicesSection({ initialDevices, hasApiKey }: Props) {
  const [devices, setDevices] = useState(initialDevices);
  const [syncPending, startSync] = useTransition();

  function handleSync() {
    startSync(async () => {
      const res = await syncGoveeDevices();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDevices(res.data);
      toast.success(
        res.data.length === 0
          ? "Sync complete — no lights found on your Govee account."
          : `Synced ${res.data.length} light${res.data.length === 1 ? "" : "s"}.`,
      );
    });
  }

  if (!hasApiKey) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--sd-line)] bg-[var(--sd-hover)]/40 p-5">
        <p className="text-sm text-[var(--sd-ink-dull)]">
          Add a Govee API key under{" "}
          <span className="text-micro tracking-[0.06em] text-[var(--sd-ink)]">
            API keys
          </span>{" "}
          above, then sync to discover your lights. You can also set{" "}
          <code className="rounded bg-[var(--sd-box)] px-1 py-0.5 font-mono text-micro">
            GOVEE_API_KEY
          </code>{" "}
          on the server as a fallback.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--sd-ink-dull)]">
          Discover lights from your Govee account, rename them for JARVIS, and
          pick a default when you don&rsquo;t specify which light to control.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncPending}
          className="shrink-0"
        >
          {syncPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">Sync</span>
        </Button>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--sd-line)] bg-[var(--sd-hover)]/40 p-5">
          <p className="text-sm text-[var(--sd-ink-dull)]">
            No lights registered yet. Hit{" "}
            <span className="text-micro tracking-[0.06em] text-[var(--sd-ink)]">
              Sync
            </span>{" "}
            to pull devices from Govee.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {devices.map((device) => (
            <GoveeDeviceRow
              key={device.id}
              device={device}
              onUpdate={setDevices}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoveeDeviceRow({
  device,
  onUpdate,
}: {
  device: GoveeDeviceRow;
  onUpdate: DevicesUpdater;
}) {
  const [name, setName] = useState(device.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== device.name;

  function handleRename() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    startTransition(async () => {
      const res = await renameGoveeDevice(device.id, trimmed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onUpdate((prev) =>
        prev.map((d) => (d.id === device.id ? res.data : d)),
      );
      setName(res.data.name);
      toast.success("Light renamed.");
    });
  }

  function handleSetDefault() {
    if (device.isDefault) return;
    setError(null);
    startTransition(async () => {
      const res = await setDefaultGoveeDevice(device.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onUpdate(res.data);
      toast.success("Default light updated.");
    });
  }

  function handleRemove() {
    if (
      !confirm(
        `Remove "${device.name}" from your registry? This does not reset the hardware.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await removeGoveeDevice(device.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onUpdate(res.data);
      toast.success("Light removed.");
    });
  }

  return (
    <li className="space-y-2.5 rounded-lg border border-[var(--sd-line)] bg-[var(--sd-box)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {device.isDefault ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sd-line)] px-2 py-0.5 text-micro text-[var(--ink-amber)]">
            <Star className="h-3 w-3 fill-current" />
            Default
          </span>
        ) : null}
        <span className="text-micro tracking-[0.08em] text-[var(--sd-ink-dull)]">
          {device.sku}
        </span>
        <span className="text-micro tracking-[0.08em] text-[var(--sd-ink-faint)]">
          · Unknown online
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          disabled={pending}
          className="font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) handleRename();
          }}
        />
        {dirty ? (
          <Button
            type="button"
            size="sm"
            onClick={handleRename}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {!device.isDefault ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSetDefault}
            disabled={pending}
          >
            Set default
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRemove}
          disabled={pending}
          className="text-[var(--ink-coral)] hover:text-[var(--ink-coral)]"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">Remove</span>
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-[var(--ink-coral)]">{error}</p>
      ) : null}
    </li>
  );
}
