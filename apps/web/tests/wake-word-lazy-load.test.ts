/**
 * Phase 12 / WAKE-01 — Lazy-load contract.
 *
 * Wave 0 (TDD RED): These tests intentionally fail at this stage because
 * apps/web/lib/voice/wake-word-client.ts does not yet exist. Task 4 will
 * land the implementation and bring the suite GREEN.
 *
 * Contract under test: importing `@/lib/voice/wake-word-client` must NOT
 * trigger any fetch() against /wake-word/* paths. Only an explicit call to
 * spawnWakeWordWorker() (or prefetchWakeWordAssets()) initiates the
 * downloads. This is the WAKE-01 invariant: voice assets only download
 * when the user actually opts in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("WAKE-01 lazy load", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response("", { status: 200, headers: { "Content-Type": "application/octet-stream" } }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: global override for the test sandbox
    (globalThis as any).fetch = fetchSpy;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT fetch /wake-word/* on module import", async () => {
    await import("@/lib/voice/wake-word-client");
    const wakeWordFetches = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/wake-word/"),
    );
    expect(wakeWordFetches.length).toBe(0);
  });

  it("does NOT fetch /voice/ort-wasm* on module import", async () => {
    await import("@/lib/voice/wake-word-client");
    const ortFetches = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/voice/ort-wasm"),
    );
    expect(ortFetches.length).toBe(0);
  });

  it("DOES fetch /wake-word/* assets on prefetchWakeWordAssets()", async () => {
    const mod = await import("@/lib/voice/wake-word-client");
    await mod.prefetchWakeWordAssets();
    const wakeWordFetches = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/wake-word/"),
    );
    // 4 ONNX files in WAKE_WORD_ASSET_URLS
    expect(wakeWordFetches.length).toBeGreaterThanOrEqual(4);
  });

  it("prefetchWakeWordAssets() reports 0..100 progress monotonically", async () => {
    const mod = await import("@/lib/voice/wake-word-client");
    const progress: number[] = [];
    await mod.prefetchWakeWordAssets({ onProgress: (p) => progress.push(p) });
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(100);
    // Monotonic non-decreasing
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
  });
});
