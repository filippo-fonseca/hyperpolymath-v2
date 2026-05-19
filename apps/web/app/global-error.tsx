'use client';

import { useState } from 'react';

/**
 * Phase 06.1 Plan 06 (UI-SPEC §12d, §14) — root layout error boundary.
 *
 * Only fires when the root layout itself throws (rare — providers crash,
 * fonts fail to load, layout.tsx code error). Must include its own
 * <html> and <body> tags because the failing layout owns them.
 *
 * Mechanism preserved from Phase 6 06-02 per UI-SPEC §14 — usePathname
 * unavailable here (no Next.js client navigation context when the root
 * layout has failed); inline styles only (sometimes the build that errored
 * took globals.css with it); system serif fallback (Georgia, "Times New
 * Roman") — never assume next/font survived.
 *
 * Visual update: sRGB hex literals approximate the Phase 6.1 OKLCH base
 * palette (--canvas / --ink / --ink-muted / --ink-coral / --edge / --surface)
 * so a layout crash still reads in the parchment register without depending
 * on globals.css.
 *
 * OKLCH → sRGB hex equivalents:
 *   --canvas:    oklch(96% 0.012 75)  → #f5f3ec
 *   --ink:       oklch(22% 0.012 75)  → #2a2520
 *   --ink-muted: oklch(48% 0.010 75)  → #766f64
 *   --ink-coral: oklch(58% 0.205 25)  → #dc2626
 *   --edge:      oklch(84% 0.008 75)  → #d4cfc4
 *   --surface:   oklch(93% 0.010 75)  → #ece8df
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
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      /* clipboard unavailable — no fallback in global-error since fonts may not be loaded */
    }
  }

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          background: '#f5f3ec',
          color: '#2a2520',
          margin: 0,
        }}
      >
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
          {/* Circular coral indicator (no Lucide — assets may not have loaded) */}
          <div
            aria-hidden="true"
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#dc2626',
              marginBottom: '1.5rem',
            }}
          />
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2.25rem',
              fontWeight: 600,
              margin: 0,
              marginBottom: '1rem',
              color: '#2a2520',
            }}
          >
            Something went wrong.
          </h1>
          <p
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '1rem',
              color: '#766f64',
              maxWidth: '28rem',
              margin: 0,
              marginBottom: '2rem',
            }}
          >
            The application failed to load. Copy the report and paste it in a GitHub issue —
            the digest links it to the server log.
          </p>
          {error.digest && (
            <code
              style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#766f64',
                marginBottom: '2rem',
              }}
            >
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
                border: 'none',
                background: '#2a2520',
                color: '#f5f3ec',
                cursor: 'pointer',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '0.875rem',
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
                border: '1px solid #d4cfc4',
                background: '#ece8df',
                color: '#2a2520',
                cursor: 'pointer',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '0.875rem',
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
