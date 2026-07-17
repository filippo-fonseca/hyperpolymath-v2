/**
 * Debounce + stale-response cancellation for the @-mention menu.
 *
 * Not a React hook: the menu is mounted by TipTap's suggestion plugin via
 * `createRoot` OUTSIDE the editor's React tree, and the plugin drives queries
 * imperatively from `onStart`/`onUpdate`. A plain object with `run`/`dispose`
 * fits that lifecycle, and — the reason it's shaped this way — it can be tested
 * with fake timers and no renderer at all.
 *
 * Two problems it solves, which are not the same problem:
 *
 *   1. DEBOUNCE. A keystroke per query means a round trip per keystroke.
 *      120ms is below the threshold where the menu feels laggy and above the
 *      inter-keystroke interval of ordinary typing.
 *   2. STALE RESPONSES. Debouncing does not make responses ordered. Type
 *      "ma" then "mar": if "ma" is slow and "mar" is fast, "ma" lands last and
 *      the menu shows results for a query the user has already moved past. Each
 *      run takes a monotonically increasing token and a resolve is DROPPED
 *      unless its token is still the newest — so out-of-order arrivals are
 *      ignored rather than raced.
 */

export const MENTION_SEARCH_DEBOUNCE_MS = 120;

export interface MentionSearchState<T> {
  /** True while a query is in flight (or waiting out the debounce). */
  loading: boolean;
  /** The newest settled result, or null before the first one lands. */
  results: T | null;
  /** The query `results` belongs to. */
  query: string;
}

export interface MentionSearchRunner<T> {
  /** Queue a query. Debounced; supersedes any pending or in-flight query. */
  run: (query: string) => void;
  /** Drop the pending timer and invalidate everything in flight. */
  dispose: () => void;
}

/**
 * @param search  The server action. Called with the debounced query.
 * @param onState Notified on every state transition (loading on, result in).
 */
export function createMentionSearchRunner<T>(
  search: (query: string) => Promise<T>,
  onState: (state: MentionSearchState<T>) => void,
  debounceMs: number = MENTION_SEARCH_DEBOUNCE_MS,
): MentionSearchRunner<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;
  let disposed = false;

  function run(query: string) {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);

    // Bump on every call, not just on fire: a query superseded DURING its
    // debounce window must also invalidate anything already in flight, or the
    // older request can still land after the newer one is queued.
    token += 1;
    const mine = token;

    onState({ loading: true, results: null, query });

    timer = setTimeout(() => {
      timer = null;
      void search(query)
        .then((results) => {
          if (disposed || mine !== token) return;
          onState({ loading: false, results, query });
        })
        .catch(() => {
          if (disposed || mine !== token) return;
          // A failed lookup shows an empty menu, never an error into the
          // editor: the same quiet-degradation posture searchEntityMentions
          // takes when unauthenticated.
          onState({ loading: false, results: null, query });
        });
    }, debounceMs);
  }

  function dispose() {
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    // Invalidate in-flight resolves so a late response can't call onState into
    // an unmounted root.
    token += 1;
  }

  return { run, dispose };
}
