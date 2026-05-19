'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Phase 6 Plan 06-02: (app) route group error boundary (RES-01, RES-07, D-03).
 *
 * Catches unhandled errors in tasks, captures, calendar, JARVIS, settings,
 * insights, /today routes. Renders the branded fallback with a Copy error
 * report button (navigator.clipboard).
 *
 * D-03 — no telemetry vendor. The clipboard payload is the bug-report
 * mechanism. Server-side errors land in console.error + Vercel runtime log;
 * error.digest is the cross-reference key (Next.js 16.2 sanitizes Server
 * Component error.message in production — RESEARCH §3 Pitfall 3).
 *
 * Layout: full-viewport centered, EB Garamond, neumorphic buttons (D-07),
 * generous py-24 vertical rhythm (UI-SPEC §5a empty-state mirror).
 */
export default function AppError({
  error,
  unstable_retry: _unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const pathname = usePathname();
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  function buildPayload() {
    return {
      timestamp: new Date().toISOString(),
      route: pathname,
      name: error.name,
      message: error.message,
      digest: error.digest ?? 'none',
      stack: error.stack ?? 'none',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
  }

  async function copyReport() {
    const payload = buildPayload();
    // Code-fenced JSON so a paste into GitHub renders correctly.
    const text = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 500);
    } catch {
      // Clipboard API unavailable (insecure context, ancient browser).
      // Fall back to a textarea + execCommand selection so the user can copy manually.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopyState('copied');
        window.setTimeout(() => setCopyState('idle'), 500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  function reloadPage() {
    window.location.reload();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-4xl font-serif font-semibold mb-4">Something went wrong.</h1>
      <p className="text-base font-serif text-muted-foreground max-w-md mb-8">
        An unexpected error occurred. Copy the report and paste it in a GitHub issue —
        the digest links it to the server log.
      </p>
      {error.digest && (
        <code className="text-xs font-mono text-muted-foreground mb-8">
          digest: {error.digest}
        </code>
      )}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={copyReport}
          className="h-9 px-4 inline-flex items-center justify-center rounded-md text-sm font-serif cursor-pointer transition-shadow"
          style={{
            boxShadow: copyState === 'copied' ? 'var(--shadow-nm-button-active)' : 'var(--shadow-nm-button)',
          }}
        >
          {copyState === 'copied' ? 'Copied' : 'Copy error report'}
        </button>
        <button
          type="button"
          onClick={reloadPage}
          className="h-9 px-4 inline-flex items-center justify-center rounded-md text-sm font-serif cursor-pointer transition-shadow text-muted-foreground"
          style={{ boxShadow: 'var(--shadow-nm-button)' }}
        >
          Reload page
        </button>
      </div>
    </main>
  );
}
