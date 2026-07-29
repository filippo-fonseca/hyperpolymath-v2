"use client";

/**
 * McpTokensClient — Mint / reveal-once / revoke flow for MCP bearer tokens.
 *
 * Phase 999.12 Plan 05 / MCP-05. UX mirrors DesktopDevicesClient verbatim
 * (same shadcn primitives, same sonner toasts, same useTransition for
 * in-flight state, same "copy this, you won't see it again" surface).
 *
 * v1 single-token constraint per CONTEXT.md:
 *   - mintMcpToken's onConflictDoUpdate (composite PK on user_id + provider)
 *     means a second mint silently overwrites the first
 *   - Copy must clearly communicate "minting a new token replaces the
 *     current one" so the user isn't surprised when their old device dies
 *   - When `existing.length > 0`, show a confirm dialog before letting the
 *     mint go through
 *
 * Server stores SHA-256 hash only. The plaintext is shown once in the
 * fresh-token panel with a copy button. Subsequent page visits show the
 * token row (label + dates) but NOT the plaintext.
 */

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Copy, Check, Trash2, AlertTriangle } from "lucide-react";
import {
  mintMcpTokenAction,
  revokeMcpTokenAction,
} from "./actions";
import type { McpTokenRow } from "./page";

interface Props {
  existing: McpTokenRow[];
  mcpUrl: string;
}

export function McpTokensClient({ existing, mcpUrl }: Props) {
  const [tokens, setTokens] = useState(existing);
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<{
    plaintext: string;
    name: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasExisting = tokens.length > 0;

  async function onMint() {
    if (!name.trim()) {
      toast.error("Give the token a name first.");
      return;
    }
    if (hasExisting) {
      const confirmed = confirm(
 "You already have an MCP token. Minting a new one will REPLACE it — the previous token will stop working immediately. Continue?",
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      const res = await mintMcpTokenAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setFreshToken(res.data);
      const justMintedName = res.data.name;
      setName("");
      // Optimistically replace the local list with the new single token row.
      setTokens([
        {
          name: justMintedName,
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        },
      ]);
      toast.success("Token minted. Copy it now — you won't see it again.");
    });
  }

  async function onRevoke() {
    const confirmed = confirm(
 "Revoke this token? Any device using it will immediately stop working.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const res = await revokeMcpTokenAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTokens([]);
      setFreshToken(null);
      toast.success("Token revoked.");
    });
  }

  async function onCopy() {
    if (!freshToken) return;
    await navigator.clipboard.writeText(freshToken.plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-10">
      {/* v1 limit notice */}
      {/* Advisory, not alarm: a butter plate with a saturated rim, matching
          the tint grammar the rest of the app uses for a soft warning. */}
      <aside className="tint-butter flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--tint-edge)_55%,transparent)] bg-[var(--tint-bg)] p-4 shadow-[var(--shadow-card)]">
        <AlertTriangle
          size={16}
          className="shrink-0 mt-0.5 text-[var(--tint-ink)]"
        />
        <p className="text-[14px] leading-[1.55] text-[var(--ink-muted)]">
          <span className="font-semibold text-[var(--ink)]">
            One token per account.
          </span>{" "}
          Minting a new token <em>replaces</em> the current one — any device
          still using the old token immediately stops working. Multi-token
          support is a future enhancement.
        </p>
      </aside>

      {/* Mint form */}
      <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg text-[var(--ink)]">
          {hasExisting ? "Replace token" : "Mint token"}
        </h2>
        <p className="mt-1 text-[14px] text-[var(--ink-muted)]">
          Give the token a label you&rsquo;ll recognize (e.g. &ldquo;Claude
          Desktop on Mac&rdquo;).
        </p>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude Desktop on Mac"
            maxLength={100}
            className="flex-1 rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 text-[15px] text-[var(--ink)] shadow-[var(--shadow-card)] outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out hover:border-[var(--edge-strong)] focus:border-[var(--edge-strong)]"
            disabled={pending}
          />
          <button
            type="button"
            onClick={onMint}
            disabled={pending}
            className="rounded-lg bg-[var(--ink)] px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--canvas)] shadow-[var(--shadow-card)] transition-[opacity,box-shadow] duration-[160ms] ease-out hover:opacity-90 hover:shadow-[var(--shadow-card-hover)] disabled:opacity-40"
          >
            {pending ? "Minting…" : hasExisting ? "Replace" : "Mint token"}
          </button>
        </div>

        {/* The one-time reveal earns a hue of its own: a mint plate so the
            "copy me now" moment is visibly different from the form it sits
            inside. */}
        {freshToken ? (
          <div className="tint-mint mt-5 rounded-xl border border-[color-mix(in_srgb,var(--tint-edge)_55%,transparent)] bg-[var(--tint-bg)] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tint-ink)]">
              Copy this token — you won&rsquo;t see it again
            </p>
            <div className="mt-2 flex items-start gap-2">
              <code className="flex-1 break-all rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-[13px] text-[var(--ink)]">
                {freshToken.plaintext}
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
            <p className="mt-3 text-[13px] text-[var(--ink-muted)]">
              The server stores only the SHA-256 hash; the plaintext above
              never lands on disk again.
            </p>
          </div>
        ) : null}
      </section>

      {/* Existing token list */}
      <section>
        <h2 className="text-lg text-[var(--ink)]">Active token</h2>
        {tokens.length === 0 ? (
          <p className="mt-3 text-[14px] text-[var(--ink-muted)]">
            None yet. Mint one above to get started.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--edge)] overflow-hidden rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]">
            {tokens.map((t) => (
              <li
                key={t.name + t.createdAt}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] text-[var(--ink)] truncate">
                    {t.name}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--ink-muted)]">
                    Created{" "}
                    {formatDistanceToNow(new Date(t.createdAt), {
                      addSuffix: true,
                    })}
                    {" · "}
                    Last used{" "}
                    {formatDistanceToNow(new Date(t.lastUsedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRevoke}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--edge)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] transition-[color,border-color,box-shadow] duration-[160ms] ease-out hover:border-[color-mix(in_oklch,var(--ink-coral)_35%,var(--edge))] hover:text-[var(--ink-coral)] hover:shadow-[var(--shadow-card)]"
                  aria-label="Revoke token"
                >
                  <Trash2 size={12} />
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Connection instructions */}
      <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg text-[var(--ink)]">
          Connect from an MCP client
        </h2>
        <p className="mt-1 text-[14px] text-[var(--ink-muted)]">
          Point a Streamable-HTTP MCP client (Claude Code, Claude Desktop,
          claude.ai web) at this URL with your token as a Bearer header.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
              Endpoint
            </p>
            <code className="mt-1 block break-all rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 py-2 font-mono text-[13px] text-[var(--ink)]">
              {mcpUrl}
            </code>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
              Header
            </p>
            <code className="mt-1 block break-all rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 py-2 font-mono text-[13px] text-[var(--ink)]">
              Authorization: Bearer &lt;your-token&gt;
            </code>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
              Quick verify (MCP inspector)
            </p>
            <code className="mt-1 block break-all rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 py-2 font-mono text-[13px] text-[var(--ink)] whitespace-pre-wrap">
              {`npx -y @modelcontextprotocol/inspector \\\n  --transport http ${mcpUrl} \\\n  --header "Authorization: Bearer <your-token>"`}
            </code>
          </div>
        </div>
      </section>
    </div>
  );
}
