"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import {
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDERS,
  type ByokProvider,
} from "@/lib/byok/providers";
import { deleteApiKey, saveApiKey } from "@/app/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  /** Server-rendered status per provider — configured flag + last-4 fingerprint. */
  status: Record<ByokProvider, { configured: boolean; last4: string | null }>;
}

/**
 * Settings → API keys (BYOK).
 *
 * One row per provider. When a key is configured we show its last-4 fingerprint
 * plus a Remove control; otherwise a password input + Save. Each action runs in
 * a useTransition so the row can show a pending state without blocking siblings.
 *
 * The plaintext never round-trips back: Save returns only the last-4, which we
 * fold into local state so the row flips to its "configured" view immediately.
 */
export function ApiKeysSection({ status }: Props) {
  return (
    <div className="space-y-5">
      {BYOK_PROVIDER_IDS.map((provider) => (
        <ApiKeyRow
          key={provider}
          provider={provider}
          initialConfigured={status[provider].configured}
          initialLast4={status[provider].last4}
        />
      ))}
    </div>
  );
}

function ApiKeyRow({
  provider,
  initialConfigured,
  initialLast4,
}: {
  provider: ByokProvider;
  initialConfigured: boolean;
  initialLast4: string | null;
}) {
  const meta = BYOK_PROVIDERS[provider];
  const [configured, setConfigured] = useState(initialConfigured);
  const [last4, setLast4] = useState(initialLast4);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    const key = value.trim();
    if (!key) {
      setError("Enter a key first.");
      return;
    }
    startTransition(async () => {
      const res = await saveApiKey(provider, key);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfigured(true);
      setLast4(res.last4);
      setValue("");
      toast.success(`${meta.label} key saved.`);
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteApiKey(provider);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfigured(false);
      setLast4(null);
      toast.success(`${meta.label} key removed.`);
    });
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-[var(--sd-line)] bg-[var(--sd-box)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-[var(--sd-ink)]">
            {meta.label}
          </span>
          {meta.required ? (
            <span className="rounded-full border border-[var(--sd-line)] px-2 py-0.5 text-micro text-[var(--sd-ink-dull)]">
              Required
            </span>
          ) : null}
          {configured ? (
            <span className="flex items-center gap-1 text-micro tracking-[0.08em] text-[var(--ink-amber)]">
              <Check className="h-3 w-3" />
              Configured
            </span>
          ) : null}
        </div>
        <a
          href={meta.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-micro tracking-[0.06em] text-[var(--sd-ink-dull)] transition-colors duration-150 ease-out hover:text-[var(--sd-ink)] cursor-pointer-always"
        >
          Get your key
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="text-sm text-[var(--sd-ink-dull)]">{meta.powers}</p>

      {configured ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="font-mono text-sm tabular-nums text-[var(--sd-ink)]">
            •••• {last4 ?? "••••"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
 "Remove"
            )}
          </Button>
        </div>
      ) : (
        <div className="flex items-stretch gap-2 pt-1">
          <Input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder={
              meta.keyPrefix ? `${meta.keyPrefix}…` : "Paste your API key"
            }
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            className="font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
 "Save"
            )}
          </Button>
        </div>
      )}

      {error ? (
        <p className="text-xs text-[var(--ink-coral)]">{error}</p>
      ) : null}
    </div>
  );
}
