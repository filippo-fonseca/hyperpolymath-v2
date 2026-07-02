/**
 * JARVIS executor computer-control tools — JSON contract guarantee.
 *
 * Asserts the exact { ok, action: { kind, ... } } result shapes for
 * open_url, open_app, and web_search (including URL construction for
 * BOTH google and maps engines). These are the contracts the desktop
 * client keys off to drive the Mac.
 *
 * The executor arms have NO DB writes and NO gcal calls, so the mocks
 * here are minimal — just enough to let createServerExecutor() build.
 */

import { describe, expect, it, vi } from "vitest";
import { createServerExecutor } from "@/lib/jarvis/executor";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

// ---------------------------------------------------------------------------
// Minimal mocks — computer-control arms don't touch DB or gcal
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({}));
vi.mock("@/lib/gcal/events", () => ({}));
vi.mock("@/lib/gcal/token", () => ({
  GcalTokenRevokedError: class extends Error {},
  GcalNotConnectedError: class extends Error {},
  getValidGcalToken: vi.fn(),
}));
vi.mock("@/lib/captures/auto-tag", () => ({ scheduleAutoTagging: vi.fn() }));
vi.mock("@/app/actions/hashtags", () => ({ upsertHashtag: vi.fn() }));
vi.mock("@/app/actions/people", () => ({
  reconcilePersonReferencesForUser: vi.fn(),
  resolveOrCreatePersonForUser: vi.fn(),
}));
vi.mock("@/lib/db/queries/people", () => ({ getPeopleForUser: vi.fn() }));
vi.mock("@/lib/jarvis/validate-references", () => ({
  validateCalendarId: vi.fn(),
  validateProjectIds: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared test context
// ---------------------------------------------------------------------------

const ctx: ExecutionContext = {
  userId: "test-user-123",
  userTimezone: "America/New_York",
  defaultCalendarId: null,
};

// ---------------------------------------------------------------------------
// open_url
// ---------------------------------------------------------------------------

describe("executor.openUrl", () => {
  it("returns ok:true with action kind:'open_url', url, and label defaulting to url", async () => {
    const executor = createServerExecutor();
    const result = await executor.openUrl({ url: "https://example.com" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.action).toEqual({
      kind: "open_url",
      url: "https://example.com",
      label: "https://example.com",
    });
  });

  it("uses provided label instead of url when supplied", async () => {
    const executor = createServerExecutor();
    const result = await executor.openUrl(
      { url: "https://example.com/article", label: "the article" },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.action).toEqual({
      kind: "open_url",
      url: "https://example.com/article",
      label: "the article",
    });
  });

  it("receipt contains url and label", async () => {
    const executor = createServerExecutor();
    const result = await executor.openUrl({ url: "https://google.com", label: "Google" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt).toMatchObject({ url: "https://google.com", label: "Google" });
  });
});

// ---------------------------------------------------------------------------
// open_app
// ---------------------------------------------------------------------------

describe("executor.openApp", () => {
  it("returns ok:true with action kind:'open_app', app, and label defaulting to app", async () => {
    const executor = createServerExecutor();
    const result = await executor.openApp({ app: "Spotify" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.action).toEqual({
      kind: "open_app",
      app: "Spotify",
      label: "Spotify",
    });
  });

  it("uses provided label instead of app name when supplied", async () => {
    const executor = createServerExecutor();
    const result = await executor.openApp({ app: "VS Code", label: "the editor" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.action).toEqual({
      kind: "open_app",
      app: "VS Code",
      label: "the editor",
    });
  });

  it("receipt contains app and label", async () => {
    const executor = createServerExecutor();
    const result = await executor.openApp({ app: "Figma" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt).toMatchObject({ app: "Figma", label: "Figma" });
  });
});

// ---------------------------------------------------------------------------
// web_search — URL construction (both engines)
// ---------------------------------------------------------------------------

describe("executor.webSearch", () => {
  it("google engine: builds correct Google Search URL", async () => {
    const executor = createServerExecutor();
    const result = await executor.webSearch({ query: "how to cook pasta", engine: "google" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.action).toEqual({
      kind: "open_url",
      url: "https://www.google.com/search?q=how%20to%20cook%20pasta",
      label: "the web",
    });
  });

  it("google engine is default when engine is omitted", async () => {
    const executor = createServerExecutor();
    const result = await executor.webSearch({ query: "typescript generics" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const action = result.action as { kind: string; url: string; label: string };
    expect(action.kind).toBe("open_url");
    expect(action.url).toBe(
      "https://www.google.com/search?q=" + encodeURIComponent("typescript generics"),
    );
    expect(action.label).toBe("the web");
  });

  it("maps engine: builds correct Google Maps URL", async () => {
    const executor = createServerExecutor();
    const result = await executor.webSearch({ query: "coffee near campus", engine: "maps" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.action).toEqual({
      kind: "open_url",
      url: "https://www.google.com/maps/search/?api=1&query=coffee%20near%20campus",
      label: "Google Maps",
    });
  });

  it("maps engine uses label 'Google Maps'", async () => {
    const executor = createServerExecutor();
    const result = await executor.webSearch({ query: "Harvard Medical School", engine: "maps" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const action = result.action as { kind: string; url: string; label: string };
    expect(action.label).toBe("Google Maps");
  });

  it("URL-encodes special characters in query", async () => {
    const executor = createServerExecutor();
    const result = await executor.webSearch(
      { query: "C++ templates & lambdas", engine: "google" },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const action = result.action as { kind: string; url: string; label: string };
    expect(action.url).toBe(
      "https://www.google.com/search?q=" + encodeURIComponent("C++ templates & lambdas"),
    );
  });

  it("receipt contains query, engine, url, and label", async () => {
    const executor = createServerExecutor();
    const result = await executor.webSearch({ query: "next.js app router", engine: "google" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt).toMatchObject({
      query: "next.js app router",
      engine: "google",
      url: expect.stringContaining("google.com/search"),
      label: "the web",
    });
  });
});

// ---------------------------------------------------------------------------
// computer_use — Computer Use catch-all fallback
// ---------------------------------------------------------------------------

describe("executor.computerUse", () => {
  it("returns ok:true with action kind:'computer_use', the task, and a minted session_id", async () => {
    const executor = createServerExecutor();
    const result = await executor.computerUse({ task: "close all my browser tabs" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const action = result.action as { kind: string; task: string; session_id: string };
    expect(action.kind).toBe("computer_use");
    expect(action.task).toBe("close all my browser tabs");
    // session_id is a server-minted UUID (crypto.randomUUID)
    expect(action.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.id).toBe(`computer_use:${action.session_id}`);
  });

  it("receipt carries task and the same session_id as the action", async () => {
    const executor = createServerExecutor();
    const result = await executor.computerUse({ task: "tidy up my desktop icons" }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const action = result.action as { session_id: string };
    expect(result.receipt).toEqual({
      task: "tidy up my desktop icons",
      session_id: action.session_id,
    });
  });

  it("mints a DIFFERENT session_id per dispatch", async () => {
    const executor = createServerExecutor();
    const a = await executor.computerUse({ task: "task one" }, ctx);
    const b = await executor.computerUse({ task: "task one" }, ctx);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    const idA = (a.action as { session_id: string }).session_id;
    const idB = (b.action as { session_id: string }).session_id;
    expect(idA).not.toBe(idB);
  });

  it("trims the task and rejects a whitespace-only task as validation error", async () => {
    const executor = createServerExecutor();
    const trimmed = await executor.computerUse({ task: "  close the popups  " }, ctx);
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) throw new Error("expected ok");
    expect((trimmed.action as { task: string }).task).toBe("close the popups");

    const empty = await executor.computerUse({ task: "   " }, ctx);
    expect(empty.ok).toBe(false);
    if (empty.ok) throw new Error("expected validation failure");
    expect(empty.kind).toBe("validation");
  });
});
