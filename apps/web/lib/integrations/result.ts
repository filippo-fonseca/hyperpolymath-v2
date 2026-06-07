/**
 * Shared Result<T> contract for Life-tab integrations (260607-h2k, D-06).
 *
 * Every integration function returns Result<T>. Never throws to the page.
 * Per-panel errors render an inline "Couldn't load" / "Reconnect" state —
 * one panel failing never breaks the others or the page.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });
