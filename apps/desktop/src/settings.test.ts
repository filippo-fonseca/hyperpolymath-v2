/**
 * settings — the wake.enabledExplicit contract.
 *
 * `wake.enabled` is the most dangerous key in the app. The plugin-store bakes
 * its whole defaults map into the JSON on the first write of ANY key, so an
 * install can carry `wake.enabled: true` (the OLD default) without the user
 * having ever touched the toggle — indistinguishable from an explicit choice.
 * Wake keeps the macOS green mic indicator lit continuously, so guessing wrong
 * is a privacy regression, not a cosmetic one.
 *
 * The guard: loadSettings trusts a persisted `wake.enabled` ONLY when the
 * `wake.enabledExplicit` marker is present, and saveSetting writes that marker
 * only on the `wakeEnabled` key. These tests pin both halves so a future
 * rewrite of the persistence layer cannot drop the marker silently.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory stand-in for the tauri plugin-store, shared with the mock below. */
let backing: Record<string, unknown> = {};

const storeMock = {
  get: vi.fn(async (key: string) => backing[key]),
  set: vi.fn(async (key: string, value: unknown) => {
    backing[key] = value;
  }),
};

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => storeMock),
}));

async function freshSettings(): Promise<typeof import("./settings")> {
  // settings.ts memoises the store handle in a module-level `_store`, so the
  // module registry is reset per test to keep cases independent.
  vi.resetModules();
  return import("./settings");
}

beforeEach(() => {
  backing = {};
  storeMock.get.mockClear();
  storeMock.set.mockClear();
});

describe("loadSettings — wake opt-in", () => {
  it("returns wake OFF for a fresh install with nothing persisted", async () => {
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.wakeEnabled)).resolves.toBe(false);
  });

  it("IGNORES a persisted wake.enabled:true when the marker is absent", async () => {
    // Exactly the baked-default case: an old install whose settings JSON
    // carries the previous `true` default that the user never chose.
    backing["wake.enabled"] = true;
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.wakeEnabled)).resolves.toBe(false);
  });

  it("honours wake.enabled:true once the explicit marker is present", async () => {
    backing["wake.enabled"] = true;
    backing["wake.enabledExplicit"] = true;
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.wakeEnabled)).resolves.toBe(true);
  });

  it("honours an explicit wake.enabled:false", async () => {
    backing["wake.enabled"] = false;
    backing["wake.enabledExplicit"] = true;
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.wakeEnabled)).resolves.toBe(false);
  });

  it("treats a non-true marker as absent", async () => {
    backing["wake.enabled"] = true;
    backing["wake.enabledExplicit"] = "yes";
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.wakeEnabled)).resolves.toBe(false);
  });
});

describe("saveSetting — wake marker", () => {
  it("writes the explicit marker alongside wakeEnabled", async () => {
    const { saveSetting } = await freshSettings();
    await saveSetting("wakeEnabled", true);
    expect(backing["wake.enabled"]).toBe(true);
    expect(backing["wake.enabledExplicit"]).toBe(true);
  });

  it("writes the marker when the user explicitly turns wake OFF too", async () => {
    const { saveSetting } = await freshSettings();
    await saveSetting("wakeEnabled", false);
    expect(backing["wake.enabled"]).toBe(false);
    expect(backing["wake.enabledExplicit"]).toBe(true);
  });

  it("does NOT write the marker for any other key", async () => {
    const { saveSetting } = await freshSettings();
    await saveSetting("ttsEnabled", false);
    await saveSetting("manualMode", true);
    expect(backing).not.toHaveProperty("wake.enabledExplicit");
  });

  it("round-trips a user flip: save then load returns what was chosen", async () => {
    const { saveSetting } = await freshSettings();
    await saveSetting("wakeEnabled", true);
    // A later session re-reads the same backing store from a fresh module.
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.wakeEnabled)).resolves.toBe(true);
  });
});

describe("loadSettings — persisted value sanitising", () => {
  it("drops malformed openOnStart entries and trims the survivors", async () => {
    backing["startup.openOnStart"] = [
      { type: "url", value: " https://mail.google.com " },
      { type: "bogus", value: "x" },
      { type: "app", value: "" },
      null,
      { type: "app", value: "Spotify" },
    ];
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.startupOpenOnStart)).resolves.toEqual([
      { type: "url", value: "https://mail.google.com" },
      { type: "app", value: "Spotify" },
    ]);
  });

  it("keeps only non-empty shortcut names", async () => {
    backing["startup.shortcuts"] = ["Morning", "   ", 42, "", " Focus "];
    const { loadSettings } = await freshSettings();
    await expect(loadSettings().then((s) => s.startupShortcuts)).resolves.toEqual([
      "Morning",
      "Focus",
    ]);
  });

  it("falls back to the default bridge URL when the persisted one is blank", async () => {
    backing["whatsapp.bridgeUrl"] = "   ";
    const { loadSettings, DEFAULT_SETTINGS } = await freshSettings();
    await expect(loadSettings().then((s) => s.whatsappBridgeUrl)).resolves.toBe(
      DEFAULT_SETTINGS.whatsappBridgeUrl,
    );
  });
});
