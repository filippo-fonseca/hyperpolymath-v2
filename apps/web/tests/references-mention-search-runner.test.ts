import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMentionSearchRunner,
  MENTION_SEARCH_DEBOUNCE_MS,
  type MentionSearchState,
} from "@/lib/references/mention-search-runner";

/** A search whose resolution each caller controls, so ordering can be forced. */
function deferredSearch() {
  const calls: { query: string; resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];
  const search = (query: string) =>
    new Promise<string>((resolve, reject) => {
      calls.push({ query, resolve, reject });
    });
  return { search, calls };
}

describe("createMentionSearchRunner", () => {
  let states: MentionSearchState<string>[];

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const record = (s: MentionSearchState<string>) => states.push(s);

  it("does not hit the server until the debounce elapses", () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);

    runner.run("m");
    expect(calls).toHaveLength(0);

    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS - 1);
    expect(calls).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toBe("m");
    runner.dispose();
  });

  it("collapses a burst of keystrokes into one query — the last one", () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);

    runner.run("m");
    vi.advanceTimersByTime(50);
    runner.run("ma");
    vi.advanceTimersByTime(50);
    runner.run("mar");
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toBe("mar");
    runner.dispose();
  });

  it("reports loading immediately, before the debounce", () => {
    const { search } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);
    runner.run("m");
    expect(states.at(-1)).toEqual({ loading: true, results: null, query: "m" });
    runner.dispose();
  });

  it("delivers results for the query that was actually sent", async () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);

    runner.run("mar");
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS);
    calls[0]?.resolve("marathon");
    await vi.waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(states.at(-1)).toEqual({ loading: false, results: "marathon", query: "mar" });
    runner.dispose();
  });

  it("drops a stale response that lands after a newer one", async () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);

    // "ma" fires and is in flight...
    runner.run("ma");
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS);
    // ...then "mar" fires and comes back FIRST.
    runner.run("mar");
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);

    calls[1]?.resolve("mar-results");
    await vi.waitFor(() => expect(states.at(-1)?.results).toBe("mar-results"));

    // The slow "ma" lands last. It must be ignored: showing it would put
    // results for a query the user has already moved past on screen.
    calls[0]?.resolve("ma-results");
    await Promise.resolve();
    await Promise.resolve();

    expect(states.at(-1)?.results).toBe("mar-results");
    expect(states.at(-1)?.query).toBe("mar");
    runner.dispose();
  });

  it("invalidates a request superseded during its own debounce window", async () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);

    runner.run("ma");
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS);
    // Superseded while "ma" is in flight but before "mar" has even fired.
    runner.run("mar");
    calls[0]?.resolve("ma-results");
    await Promise.resolve();
    await Promise.resolve();

    // "ma" must not land: the newest state is still the pending "mar".
    expect(states.at(-1)).toEqual({ loading: true, results: null, query: "mar" });
    runner.dispose();
  });

  it("shows an empty menu on failure rather than throwing into the editor", async () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);

    runner.run("m");
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS);
    calls[0]?.reject(new Error("network"));
    await vi.waitFor(() => expect(states.at(-1)?.loading).toBe(false));

    expect(states.at(-1)).toEqual({ loading: false, results: null, query: "m" });
    runner.dispose();
  });

  it("dispose cancels a pending query", () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);
    runner.run("m");
    runner.dispose();
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS * 4);
    expect(calls).toHaveLength(0);
  });

  it("dispose stops an in-flight response from calling back into a dead root", async () => {
    const { search, calls } = deferredSearch();
    const runner = createMentionSearchRunner(search, record);

    runner.run("m");
    vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS);
    runner.dispose();
    const before = states.length;
    calls[0]?.resolve("late");
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toHaveLength(before);
  });
});
