/**
 * disconnectGcal() — Pitfall 6 ordering + best-effort revoke (m-02 fix).
 *
 * Phase 4 Plan 04-02 Task 1 Step 6.
 *
 * The single most load-bearing invariant: db.update MUST be called BEFORE
 * oauth2Client.revokeToken. Pitfall 6 (research) — the opposite order risks
 * the worse failure mode of "Google revoked but DB still shows connected;
 * every subsequent getValidGcalToken call throws GcalTokenRevokedError".
 *
 * We enforce ordering via vitest's `mock.invocationCallOrder` (a global
 * monotonic counter incremented on every mock call). The pattern is
 * equivalent to `toHaveBeenCalledBefore` from jest-extended but works
 * without an additional dependency.
 *
 * Three tests:
 *   1. happy path — db.update called BEFORE revokeToken.
 *   2. revoke failure — Server Action still resolves success (DB cleared).
 *   3. no refresh token in DB — revokeToken NOT called.
 *
 * Mock surface:
 *   - `@/lib/db`               — select + update
 *   - `@/lib/gcal/client`      — createOAuth2Client returns { revokeToken }
 *   - `@/lib/gcal/encryption`  — decryptToken returns a string
 *   - `@/lib/auth/get-user`    — getUserOrRedirect returns a user
 *
 * No DB, no Google, no Supabase — CI-safe.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// --- mocks ---------------------------------------------------------------

// Drizzle chains — select().from().where().limit() and update().set().where().
// `dbUpdateWhereMock` is the function whose `mock.invocationCallOrder` we
// use to assert ordering. We bind it via the `where()` end of the update
// chain because that's the point at which the DB write commits.

const dbState: {
  selectResult: unknown[];
} = { selectResult: [] };

const dbUpdateWhereMock = vi.fn().mockResolvedValue(undefined);

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(() =>
    Promise.resolve(dbState.selectResult),
  );
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = dbUpdateWhereMock;
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn(() => makeUpdateChain()),
  },
}));

// auth helper — always returns a user; we never want a redirect here.
vi.mock("@/lib/auth/get-user", () => ({
  getUserOrRedirect: vi.fn(async () => ({
    id: "user-1",
    email: "filippo@example.com",
    graduationYear: null,
    onboardedAt: null,
  })),
}));

// decryptToken — return a stable plaintext so we can assert it was used.
const decryptTokenMock = vi.fn().mockReturnValue("decrypted-refresh-token");
vi.mock("@/lib/gcal/encryption", () => ({
  decryptToken: decryptTokenMock,
  encryptToken: vi.fn(),
}));

// OAuth2 client — stub revokeToken with a vi.fn we can assert ordering on.
const revokeTokenMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/gcal/client", () => ({
  createOAuth2Client: vi.fn(() => ({
    revokeToken: revokeTokenMock,
  })),
}));

// --- harness -------------------------------------------------------------

beforeEach(() => {
  // Default: user has a refresh token to revoke.
  dbState.selectResult = [{ refreshEnc: Buffer.from("ciphertext") }];
  dbUpdateWhereMock.mockClear();
  dbUpdateWhereMock.mockResolvedValue(undefined);
  decryptTokenMock.mockClear();
  decryptTokenMock.mockReturnValue("decrypted-refresh-token");
  revokeTokenMock.mockClear();
  revokeTokenMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callDisconnect() {
  const mod = await import("@/app/actions/gcal-connection");
  return mod.disconnectGcal();
}

// --- tests ---------------------------------------------------------------

describe("disconnectGcal — Pitfall 6 ordering (DB clear BEFORE revoke)", () => {
  it("calls db.update BEFORE oauth2Client.revokeToken", async () => {
    const result = await callDisconnect();

    expect(result).toEqual({ success: true });
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(1);
    expect(revokeTokenMock).toHaveBeenCalledTimes(1);
    expect(revokeTokenMock).toHaveBeenCalledWith("decrypted-refresh-token");

    // Strict ordering — Pitfall 6.
    const dbOrder = dbUpdateWhereMock.mock.invocationCallOrder[0]!;
    const revokeOrder = revokeTokenMock.mock.invocationCallOrder[0]!;
    expect(dbOrder).toBeLessThan(revokeOrder);
  });

  it("clears the three encrypted/expiry columns to NULL on the update", async () => {
    // We can't reach the .set(...) arg through dbUpdateWhereMock directly
    // because we bound to the where() step. Re-route through a fresh chain
    // that captures the set call for THIS test.
    let capturedSet: unknown = null;
    const captureSet = vi.fn().mockImplementation((arg: unknown) => {
      capturedSet = arg;
      return { where: dbUpdateWhereMock };
    });
    const dbModule = await import("@/lib/db");
    (dbModule.db.update as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => ({ set: captureSet }),
    );

    await callDisconnect();

    expect(capturedSet).not.toBeNull();
    const set = capturedSet as Record<string, unknown>;
    expect(set.gcalRefreshTokenEncrypted).toBeNull();
    expect(set.gcalAccessTokenEncrypted).toBeNull();
    expect(set.gcalTokenExpiresAt).toBeNull();
    // D-09 / D-10: NOT cleared (preserve across reconnect).
    expect(set.gcalDefaultCalendarId).toBeUndefined();
    expect(set.gcalVisibleCalendarIds).toBeUndefined();
  });
});

describe("disconnectGcal — best-effort revoke", () => {
  it("still resolves success when revokeToken throws (DB already cleared)", async () => {
    revokeTokenMock.mockRejectedValueOnce(new Error("network blip"));

    const result = await callDisconnect();

    expect(result).toEqual({ success: true });
    // DB cleared exactly once even though revoke threw.
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(1);
    expect(revokeTokenMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT call revokeToken when no refresh token exists in DB", async () => {
    // User row exists but the encrypted column is NULL (already disconnected,
    // or never connected). Disconnect should still complete + return success.
    dbState.selectResult = [{ refreshEnc: null }];

    const result = await callDisconnect();

    expect(result).toEqual({ success: true });
    // DB update still ran (idempotent clear).
    expect(dbUpdateWhereMock).toHaveBeenCalledTimes(1);
    // Nothing to revoke.
    expect(revokeTokenMock).not.toHaveBeenCalled();
    // decryptToken not called (no buffer to decrypt).
    expect(decryptTokenMock).not.toHaveBeenCalled();
  });
});
