// Live streaming text lives OUTSIDE React state. Deltas append to a plain
// buffer; a ~80ms flusher publishes to subscribers via useSyncExternalStore.
// Only the one leaf component rendering the streaming text subscribes, so a
// token tick re-renders exactly that leaf — never the turns array, never the
// list. This is the core fix for v1's per-token full-conversation re-render.

const FLUSH_MS = 80;

interface StreamSnapshot {
  turnId: string | null;
  text: string;
}

let buffer = "";
let published: StreamSnapshot = { turnId: null, text: "" };
let flushTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function flush(): void {
  if (published.turnId === null) return;
  if (published.text === buffer) return;
  published = { turnId: published.turnId, text: buffer };
  emit();
}

function stopFlusher(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export const streamStore = {
  /** Begin buffering for a turn (clears any previous stream). */
  start(turnId: string): void {
    buffer = "";
    published = { turnId, text: "" };
    stopFlusher();
    flushTimer = setInterval(flush, FLUSH_MS);
    emit();
  },

  /** Append a delta — no React work happens here. */
  append(turnId: string, delta: string): void {
    if (published.turnId !== turnId) return;
    buffer += delta;
  },

  /** Final text for the turn (flushes synchronously). */
  end(turnId: string): string {
    const text = published.turnId === turnId ? buffer : "";
    stopFlusher();
    buffer = "";
    published = { turnId: null, text: "" };
    emit();
    return text;
  },

  /** Current buffered text without waiting for a flush tick. */
  peek(turnId: string): string {
    return published.turnId === turnId ? buffer : "";
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  getSnapshot(): StreamSnapshot {
    return published;
  },
};
