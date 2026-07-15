"use client";

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Copy, Check, Trash2 } from "lucide-react";
import {
  mintDesktopDevice,
  revokeDesktopDevice,
  type DesktopDeviceRow,
} from "@/app/actions/desktop-devices";

interface Props {
  initialDevices: DesktopDeviceRow[];
}

export function DesktopDevicesClient({ initialDevices }: Props) {
  const [devices, setDevices] = useState(initialDevices);
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<{ id: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onMint() {
    const fd = new FormData();
    fd.append("name", name);
    startTransition(async () => {
      const res = await mintDesktopDevice(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setFreshToken(res.data);
      setName("");
      setDevices((prev) => [
        ...prev,
        {
          id: res.data.id,
          name: name.trim() || "Desktop",
          createdAt: new Date(),
          lastUsedAt: null,
        },
      ]);
    });
  }

  async function onRevoke(id: string) {
    if (!confirm("Revoke this device? The machine using this token immediately stops working.")) return;
    const fd = new FormData();
    fd.append("id", id);
    startTransition(async () => {
      const res = await revokeDesktopDevice(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setDevices((prev) => prev.filter((d) => d.id !== id));
      toast.success("Device revoked.");
    });
  }

  async function onCopy() {
    if (!freshToken) return;
    await navigator.clipboard.writeText(freshToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-10">
      {/* Mint form */}
      <section className="rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-6">
        <h2 className="text-lg text-[var(--sd-ink)]">New device</h2>
        <p className="mt-1 text-[14px] text-[var(--sd-ink-dull)]">
          Give the device a name you&rsquo;ll recognize (e.g. &ldquo;MacBook
          Pro&rdquo;).
        </p>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MacBook Pro"
            className="flex-1 rounded-md border border-[var(--sd-line)] bg-[var(--sd-hover)] px-3 py-2 text-[15px] text-[var(--sd-ink)] outline-none focus:border-[var(--sd-accent)]"
            disabled={pending}
          />
          <button
            type="button"
            onClick={onMint}
            disabled={pending}
            className="rounded-md bg-[var(--sd-ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--sd-app)] hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Minting…" : "Mint token"}
          </button>
        </div>

        {freshToken ? (
          <div
            className="mt-5 rounded-md border p-4"
            style={{
              borderColor: "var(--sd-accent)",
              boxShadow: "var(--glow-hud-subtle)",
            }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--hud-cyan-light)]">
              Copy this token — you won&rsquo;t see it again
            </p>
            <div className="mt-2 flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-[var(--sd-hover)] px-3 py-2 font-mono text-[13px] text-[var(--sd-ink)]">
                {freshToken.token}
              </code>
              <button
                type="button"
                onClick={onCopy}
                className="rounded-md border border-[var(--sd-line)] p-2 hover:bg-[var(--sd-hover)]"
                aria-label="Copy token"
              >
                {copied ? (
                  <Check size={16} className="text-[var(--ink-sage)]" />
                ) : (
                  <Copy size={16} className="text-[var(--sd-ink-dull)]" />
                )}
              </button>
            </div>
            <p className="mt-3 text-[13px] text-[var(--sd-ink-dull)]">
              Open the desktop app → Settings → paste this token. The server
              stores only the hash; the plaintext above never lands on disk
              again.
            </p>
          </div>
        ) : null}
      </section>

      {/* Device list */}
      <section>
        <h2 className="text-lg text-[var(--sd-ink)]">
          Authorized devices
        </h2>
        {devices.length === 0 ? (
          <p className="mt-3 text-[14px] text-[var(--sd-ink-dull)]">
            None yet. Mint one above to get started.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--sd-line)] border-y border-[var(--sd-line)]">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] text-[var(--sd-ink)] truncate">
                    {d.name}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--sd-ink-dull)]">
                    Created {formatDistanceToNow(d.createdAt, { addSuffix: true })}
                    {" · "}
                    {d.lastUsedAt
                      ? `Last used ${formatDistanceToNow(d.lastUsedAt, { addSuffix: true })}`
                      : "Never used"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRevoke(d.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--sd-line)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--ink-coral)]"
                  aria-label={`Revoke ${d.name}`}
                >
                  <Trash2 size={12} />
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
