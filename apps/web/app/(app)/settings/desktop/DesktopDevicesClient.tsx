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
      <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg text-[var(--ink)]">New device</h2>
        <p className="mt-1 text-meta text-[var(--ink-muted)]">
          Give the device a name you&rsquo;ll recognize (e.g. &ldquo;MacBook
          Pro&rdquo;).
        </p>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MacBook Pro"
            className="flex-1 rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 text-body text-[var(--ink)] shadow-[var(--shadow-card)] outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] focus:border-[var(--edge-strong)]"
            disabled={pending}
          />
          <button
            type="button"
            onClick={onMint}
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 text-micro tracking-[0.06em] text-[var(--canvas)] shadow-[var(--shadow-card)] transition-[opacity,box-shadow] duration-[160ms] ease-out hover:opacity-90 hover:shadow-[var(--shadow-card-hover)] disabled:opacity-40"
          >
            {pending ? "Minting…" : "Mint token"}
          </button>
        </div>

        {/* The one-time reveal gets its own hue so it reads as a distinct
            moment inside the form, not another field. */}
        {freshToken ? (
          <div className="tint-mint mt-5 rounded-xl border border-[color-mix(in_srgb,var(--tint-edge)_55%,transparent)] bg-[var(--tint-bg)] p-4">
            <p className="text-micro tracking-[0.08em] text-[var(--tint-ink)]">
              Copy this token — you won&rsquo;t see it again
            </p>
            <div className="mt-2 flex items-start gap-2">
              <code className="flex-1 break-all rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-meta text-[var(--ink)]">
                {freshToken.token}
              </code>
              <button
                type="button"
                onClick={onCopy}
                className="rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] hover:shadow-[var(--shadow-card-hover)]"
                aria-label="Copy token"
              >
                {copied ? (
                  <Check size={16} className="text-[var(--ink-sage)]" />
                ) : (
                  <Copy size={16} className="text-[var(--ink-muted)]" />
                )}
              </button>
            </div>
            <p className="mt-3 text-meta text-[var(--ink-muted)]">
              Open the desktop app → Settings → paste this token. The server
              stores only the hash; the plaintext above never lands on disk
              again.
            </p>
          </div>
        ) : null}
      </section>

      {/* Device list */}
      <section>
        <h2 className="text-lg text-[var(--ink)]">
          Authorized devices
        </h2>
        {devices.length === 0 ? (
          <p className="mt-3 text-meta text-[var(--ink-muted)]">
            None yet. Mint one above to get started.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--edge)] overflow-hidden rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-body text-[var(--ink)] truncate">
                    {d.name}
                  </p>
                  <p className="text-micro tracking-[0.04em] text-[var(--ink-muted)]">
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
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--edge)] px-2.5 py-1 text-micro tracking-[0.06em] text-[var(--ink-muted)] transition-[color,border-color,box-shadow] duration-[160ms] ease-out hover:border-[color-mix(in_oklch,var(--ink-coral)_35%,var(--edge))] hover:text-[var(--ink-coral)] hover:shadow-[var(--shadow-card)]"
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
