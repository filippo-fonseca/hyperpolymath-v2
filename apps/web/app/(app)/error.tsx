'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Phase 06.1 Plan 06 (UI-SPEC §3, §9a, §12d, §14) — (app) route group error boundary.
 *
 * Catches unhandled errors in tasks, captures, calendar, JARVIS, settings,
 * insights, /today routes. Mechanism preserved from Phase 6 06-02 per UI-SPEC §14:
 * clipboard.writeText with execCommand textarea fallback, code-fenced JSON
 * payload, unstable_retry signature, error.digest cross-reference (Next.js
 * sanitizes Server Component error.message in production).
 *
 * Visual register restyled per Phase 6.1:
 *   - --canvas page background, --ink-coral AlertTriangle icon (Lucide 1.5px stroke per §8a)
 *   - Serif H1 "Something went wrong." in --ink (preserved copy per §12d)
 *   - Serif body in --ink-muted (preserved copy per §12d)
 *   - Mono code-fenced report block (--surface bg + 1px --edge + p-4)
 *   - Document primary <Button> "Copy error report" + secondary <Button> "Reload page"
 *     (variants from Plan 06.1-04 shadcn rebuild — destructive ring stays --ring-doc amber per §9a)
 */
export default function AppError({
  error,
  unstable_retry,
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
      window.setTimeout(() => setCopyState('idle'), 2000);
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
        window.setTimeout(() => setCopyState('idle'), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  function reloadPage() {
    // unstable_retry is Next.js 16's preferred reset hook; fall back to reload if it throws.
    try {
      unstable_retry();
    } catch {
      window.location.reload();
    }
  }

  const errorReport = JSON.stringify(buildPayload(), null, 2);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-24"
      style={{ backgroundColor: 'var(--canvas)' }}
    >
      <div className="max-w-2xl w-full flex flex-col items-center gap-6">
        <AlertTriangle
          size={48}
          strokeWidth={1.5}
          style={{ color: 'var(--ink-coral)' }}
          aria-hidden="true"
        />
        <h1
          className="font-serif text-4xl font-semibold text-center"
          style={{ color: 'var(--ink)' }}
        >
          Something went wrong.
        </h1>
        <p
          className="font-serif text-base text-center max-w-md"
          style={{ color: 'var(--ink-muted)' }}
        >
          An unexpected error occurred. Copy the report and paste it in a GitHub issue —
          the digest links it to the server log.
        </p>
        {error.digest && (
          <code
            className="font-mono text-xs"
            style={{ color: 'var(--ink-muted)' }}
          >
            digest: {error.digest}
          </code>
        )}
        <pre
          className="w-full font-mono text-xs p-4 rounded-md overflow-auto max-h-64"
          style={{
            border: '1px solid var(--edge)',
            backgroundColor: 'var(--surface)',
            color: 'var(--ink-muted)',
          }}
        >
          {errorReport}
        </pre>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button type="button" variant="default" onClick={copyReport}>
            {copyState === 'copied' ? 'Copied' : 'Copy error report'}
          </Button>
          <Button type="button" variant="secondary" onClick={reloadPage}>
            Reload page
          </Button>
        </div>
      </div>
    </main>
  );
}
