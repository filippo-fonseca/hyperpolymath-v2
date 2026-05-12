/**
 * getValidGcalToken refresh + revoke + not-connected paths.
 * Phase 4 Plan 04-01 (CAL-02, D-07).
 *
 * Why these four paths matter:
 *   1. Happy path  — unexpired access token: fast path, no Google API call.
 *   2. Refresh     — access token expiring ≤60s: hit Google, persist new
 *                    encrypted tokens, return Calendar client. This is the
 *                    most-trafficked branch in steady-state operation.
 *   3. Revoked     — refresh fails with invalid_grant: CLEAR the encrypted
 *                    columns to NULL and throw GcalTokenRevokedError so the
 *                    UI's D-04 banner can drive the reconnect flow.
 *   4. Not-conn'd  — no encrypted refresh_token in DB: throw GcalNotConnected
 *                    *without* hitting Google (no token to refresh).
 *
 * Mock surface:
 *   - `@/lib/db`        — db.update / db.select chains. We use a per-test mock
 *                         object so each test asserts the specific Drizzle call
 *                         shape it cares about.
 *   - `googleapis`      — google.auth.OAuth2 constructor + setCredentials +
 *                         getAccessToken + on('tokens'). The Calendar instance
 *                         is returned unmocked (caller just stores the ref).
 *
 * No DB or Google network calls in these tests. CI-safe.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

// Encryption module needs a real key — the test fixture key is generated
// freshly per run (avoids tripping gitleaks; proves the module reads the env
// at call time).
const TEST_KEY_B64 = randomBytes(32).toString("base64");
beforeAll(() => {
  process.env.GCAL_TOKEN_ENC_KEY = TEST_KEY_B64;
});

// --- DB mock --------------------------------------------------------------
// Drizzle's fluent API resists naive mocking: db.select().from(...).where(...).limit(1)
// returns a thenable that resolves to rows. We expose two recorders per test:
//   - selectResult: rows returned by the next `db.select(...).from(users).where(...).limit(N)` chain
//   - updateCapture: captures the `.set(...)` arg + `.where(...)` arg of the next `db.update(users)...`
// Tests reset these in beforeEach.

const selectState: { result: unknown[] } = { result: [] };
const updateState: { lastSet: unknown; lastWhere: unknown; calls: number } = {
  lastSet: null,
  lastWhere: null,
  calls: 0,
};

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockImplementation((arg: unknown) => {
    updateState.lastSet = arg;
    return chain;
  });
  chain.where = vi.fn().mockImplementation((arg: unknown) => {
    updateState.lastWhere = arg;
    updateState.calls += 1;
    return Promise.resolve();
  });
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => makeSelectChain(selectState.result)),
    update: vi.fn(() => makeUpdateChain()),
  },
}));

// --- googleapis mock ------------------------------------------------------
// We intercept BOTH the OAuth2 constructor and the calendar factory. The
// OAuth client mock supports setCredentials/getAccessToken/on, with
// per-test overrides via the `oauthHandlers` shared object.

interface OAuthMock {
  setCredentials: ReturnType<typeof vi.fn>;
  getAccessToken: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  // Registered listeners — token.ts is expected to subscribe via .on("tokens", ...)
  listeners: Map<string, (...args: unknown[]) => void>;
}

const oauthHandlers: { client: OAuthMock | null } = { client: null };

function makeOAuthMock(): OAuthMock {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    listeners,
    setCredentials: vi.fn(),
    getAccessToken: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler);
    }),
  };
}

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(() => {
          oauthHandlers.client = makeOAuthMock();
          return oauthHandlers.client;
        }),
      },
      calendar: vi.fn(() => ({ __mock: "calendar_v3" })),
    },
  };
});

// --- helpers --------------------------------------------------------------

async function importTokenModule() {
  // Use a per-test dynamic import so vi.mock state is honored.
  return await import("@/lib/gcal/token");
}

async function importEncryption() {
  return await import("@/lib/gcal/encryption");
}

beforeEach(() => {
  selectState.result = [];
  updateState.lastSet = null;
  updateState.lastWhere = null;
  updateState.calls = 0;
  oauthHandlers.client = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

// --- tests ----------------------------------------------------------------

describe("getValidGcalToken — happy path (unexpired token)", () => {
  it("returns a Calendar client without invoking getAccessToken when token is unexpired", async () => {
    const { encryptToken } = await importEncryption();
    const farFuture = new Date(Date.now() + 3600 * 1000); // 1h in the future
    selectState.result = [
      {
        gcalRefreshTokenEncrypted: encryptToken("refresh_token_abc"),
        gcalAccessTokenEncrypted: encryptToken("access_token_xyz"),
        gcalTokenExpiresAt: farFuture,
      },
    ];

    const { getValidGcalToken } = await importTokenModule();
    const calendar = await getValidGcalToken("user-1");
    expect(calendar).toBeDefined();
    // Refresh path must NOT have been taken.
    expect(oauthHandlers.client?.getAccessToken).not.toHaveBeenCalled();
    // No DB writes on the happy path.
    expect(updateState.calls).toBe(0);
  });
});

describe("getValidGcalToken — refresh path (token expiring ≤60s)", () => {
  it("calls getAccessToken, persists new tokens, returns a Calendar client", async () => {
    const { encryptToken } = await importEncryption();
    const aboutToExpire = new Date(Date.now() + 30 * 1000); // 30s left
    selectState.result = [
      {
        gcalRefreshTokenEncrypted: encryptToken("refresh_token_abc"),
        gcalAccessTokenEncrypted: encryptToken("access_token_xyz"),
        gcalTokenExpiresAt: aboutToExpire,
      },
    ];

    const { getValidGcalToken } = await importTokenModule();

    // The OAuth2 client is constructed inside getValidGcalToken on the refresh
    // path — wire getAccessToken AFTER the call below by using a setTimeout-like
    // pattern won't work. Instead, set up the mock lazily: when google.auth.OAuth2
    // is invoked the constructor mock attaches getAccessToken as a vi.fn we can
    // configure here via oauthHandlers.client after the import.
    // To keep this synchronous-feeling, we install a default getAccessToken
    // implementation inline using vi.mock-with-factory above — but we override
    // it for this test by reaching into the global vi.mocked OAuth2 constructor.
    // The simpler path: re-implement OAuth2 constructor for this test.
    const { google } = await import("googleapis");
    (google.auth.OAuth2 as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const mock = makeOAuthMock();
      mock.getAccessToken.mockResolvedValue({ token: "fresh_access_token" });
      oauthHandlers.client = mock;
      return mock;
    });

    const calendar = await getValidGcalToken("user-1");
    expect(calendar).toBeDefined();
    expect(oauthHandlers.client?.getAccessToken).toHaveBeenCalled();
    // The 'tokens' event handler is what persists refreshed tokens — fire it
    // manually to verify the persistence side-effect.
    const tokensHandler = oauthHandlers.client?.listeners.get("tokens");
    expect(tokensHandler).toBeDefined();

    tokensHandler?.({
      access_token: "newly_refreshed_access",
      refresh_token: "newly_refreshed_refresh",
      expiry_date: Date.now() + 3600 * 1000,
    });

    // Allow the void-floating async write to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(updateState.calls).toBeGreaterThanOrEqual(1);
    const setArg = updateState.lastSet as Record<string, unknown> | null;
    expect(setArg).not.toBeNull();
    // Both encrypted token columns should have been set (Buffer values).
    expect(setArg && Buffer.isBuffer(setArg.gcalAccessTokenEncrypted)).toBe(true);
    expect(setArg && Buffer.isBuffer(setArg.gcalRefreshTokenEncrypted)).toBe(true);
  });
});

describe("getValidGcalToken — revoked path (invalid_grant)", () => {
  it("clears encrypted columns to NULL and throws GcalTokenRevokedError", async () => {
    const { encryptToken } = await importEncryption();
    const aboutToExpire = new Date(Date.now() + 10 * 1000);
    selectState.result = [
      {
        gcalRefreshTokenEncrypted: encryptToken("revoked_refresh"),
        gcalAccessTokenEncrypted: encryptToken("revoked_access"),
        gcalTokenExpiresAt: aboutToExpire,
      },
    ];

    const { google } = await import("googleapis");
    (google.auth.OAuth2 as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const mock = makeOAuthMock();
      const err = Object.assign(new Error("invalid_grant"), {
        response: { status: 400, data: { error: "invalid_grant" } },
        code: "400",
      });
      mock.getAccessToken.mockRejectedValue(err);
      oauthHandlers.client = mock;
      return mock;
    });

    const { getValidGcalToken, GcalTokenRevokedError } = await importTokenModule();
    await expect(getValidGcalToken("user-1")).rejects.toBeInstanceOf(GcalTokenRevokedError);

    // The DB columns must have been cleared FIRST (D-06 pitfall — Pitfall 6).
    expect(updateState.calls).toBeGreaterThanOrEqual(1);
    const setArg = updateState.lastSet as Record<string, unknown> | null;
    expect(setArg).not.toBeNull();
    expect(setArg && setArg.gcalRefreshTokenEncrypted).toBeNull();
    expect(setArg && setArg.gcalAccessTokenEncrypted).toBeNull();
  });
});

describe("getValidGcalToken — not-connected path", () => {
  it("throws GcalNotConnectedError without making a Google API call", async () => {
    // No refresh token at all in the DB row (Phase 1 plain column also empty,
    // since we treat encrypted-NULL as the source of truth).
    selectState.result = [
      {
        gcalRefreshTokenEncrypted: null,
        gcalAccessTokenEncrypted: null,
        gcalTokenExpiresAt: null,
      },
    ];

    const { getValidGcalToken, GcalNotConnectedError } = await importTokenModule();
    await expect(getValidGcalToken("user-1")).rejects.toBeInstanceOf(GcalNotConnectedError);

    // Did NOT instantiate the OAuth client (no Google call).
    expect(oauthHandlers.client).toBeNull();
    // Did NOT write to DB on the not-connected path.
    expect(updateState.calls).toBe(0);
  });
});
