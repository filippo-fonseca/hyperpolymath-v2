'use client';

import { useState } from 'react';

/**
 * Phase 6 Plan 06-02: root layout error boundary (RES-01, RES-07).
 *
 * Only fires when the root layout itself throws (rare — providers crash,
 * fonts fail to load, layout.tsx code error). Must include its own
 * <html> and <body> tags because the failing layout owns them.
 *
 * usePathname unavailable here (no Next.js client navigation context when
 * the root layout has failed), so route is omitted from the payload.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  async function copyReport() {
    const payload = {
      timestamp: new Date().toISOString(),
      route: '<root layout>',
      name: error.name,
      message: error.message,
      digest: error.digest ?? 'none',
      stack: error.stack ?? 'none',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
    const text = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 500);
    } catch {
      /* clipboard unavailable — no fallback in global-error since fonts may not be loaded */
    }
  }

  return (
    <html lang="en">
      <body style={{ fontFamily: 'Georgia, "Times New Roman", serif', background: 'hsl(42 18% 97%)', color: 'hsl(30 8% 16%)' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '2.25rem', fontWeight: 600, marginBottom: '1rem' }}>Something went wrong.</h1>
          <p style={{ fontSize: '1rem', color: 'hsl(30 5% 45%)', maxWidth: '28rem', marginBottom: '2rem' }}>
            The application failed to load. Copy the report and paste it in a GitHub issue —
            the digest links it to the server log.
          </p>
          {error.digest && (
            <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'hsl(30 5% 45%)', marginBottom: '2rem' }}>
              digest: {error.digest}
            </code>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={copyReport}
              style={{
                height: '2.25rem',
                padding: '0 1rem',
                borderRadius: '0.375rem',
                border: '1px solid hsl(38 12% 85%)',
                background: 'hsl(40 14% 93%)',
                color: 'hsl(30 8% 16%)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            >
              {copyState === 'copied' ? 'Copied' : 'Copy error report'}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                height: '2.25rem',
                padding: '0 1rem',
                borderRadius: '0.375rem',
                border: '1px solid hsl(38 12% 85%)',
                background: 'transparent',
                color: 'hsl(30 5% 45%)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            >
              Reload page
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
