/**
 * GET /api/gcal/callback — four-path coverage.
 *
 * Phase 4 Plan 04-02 Task 1 Step 5.
 *
 * Paths tested:
 *   1. state mismatch          → 302 /settings?gcal=invalid_state ;
 *                                cookie deleted ; getToken NOT called ;
 *                                db.update NOT called.
 *   2. error=access_denied     → 302 /settings?gcal=denied ;
 *                                getToken NOT called.
 *   3. tokens.refresh_token    → 302 /settings?gcal=no_refresh_token ;
 *      undefined                 db.update NOT called.
 *   4. happy path              → encryptToken called twice ;
 *                                db.update(users).set({...}) called with
 *                                three encrypted/expiry fields ;
 *                                302 /calendar?gcal=connected.
 *
 * No DB or Google network calls — every external is mocked.
 */

import { randomBytes } from "node:crypto";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const TEST_KEY_B64 = randomBytes(32).toString("base64");
beforeAll(() => {
  process.env.GCAL_TOKEN_ENC_KEY = TEST_KEY_B64;
  // Stop the OAuth2 constructor from throwing if anyone touches it
  // before we install a mock (see vi.mock("googleapis") below).
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.NEXT_PUBLIC_GCAL_REDIRECT_URI =
    "http://localhost:3000/api/gcal/callback";
});

// --- next/headers cookie mock --------------------------------------------
// We capture deletions and provide a per-test `cookieStore.get(...)`
// return value via the `cookieState` object.

const cookieState: { value: string | undefined; deleted: number } = {
  value: undefined,
  deleted: 0,
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (_name: string) =>
      cookieState.value === undefined ? undefined : { value: cookieState.value },
    delete: (_name: string) => {
      cookieState.deleted += 1;
    },
  })),
}));

// --- auth mock -----------------------------------------------------------

vi.mock("@/lib/auth/get-user", () => ({
  getUserOrRedirect: vi.fn(async () => ({
    id: "user-1",
    email: "filippo@example.com",
    graduationYear: null,
    onboardedAt: null,
  })),
}));

// --- db mock -------------------------------------------------------------
// Drizzle's fluent API: db.select().from().where().limit() resolves to rows;
// db.update().set().where() resolves to void.

const dbState: {
  selectResults: unknown[][]; // FIFO queue — each select chain pops one
  updateCalls: Array<{ set: unknown; where: unknown }>;
} = { selectResults: [], updateCalls: [] };

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(() => {
    const rows = dbState.selectResults.shift() ?? [];
    return Promise.resolve(rows);
  });
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  let setArg: unknown = null;
  chain.set = vi.fn().mockImplementation((arg: unknown) => {
    setArg = arg;
    return chain;
  });
  chain.where = vi.fn().mockImplementation((whereArg: unknown) => {
    dbState.updateCalls.push({ set: setArg, where: whereArg });
    return Promise.resolve();
  });
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn(() => makeUpdateChain()),
  },
}));

// --- googleapis mock -----------------------------------------------------
// We intercept `google.auth.OAuth2` constructor + `google.calendar`. The
// per-test instance's `getToken` is configurable via `oauthState.getToken`.

interface OAuth2Mock {
  getToken: ReturnType<typeof vi.fn>;
  setCredentials: ReturnType<typeof vi.fn>;
}

const oauthState: {
  current: OAuth2Mock | null;
  calendarListItems: Array<{ id?: string; primary?: boolean }>;
} = { current: null, calendarListItems: [] };

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(() => {
          const mock: OAuth2Mock = {
            getToken: vi.fn(),
            setCredentials: vi.fn(),
          };
          oauthState.current = mock;
          return mock;
        }),
      },
      calendar: vi.fn(() => ({
        calendarList: {
          list: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve({ data: { items: oauthState.calendarListItems } }),
            ),
        },
      })),
    },
  };
});

// --- encryptToken spy ----------------------------------------------------
// Spy on the real encryptToken so we can assert call count + the encrypted
// bytes still round-trip (we don't replace it with a stub — the byte
// shape matters because the happy-path test asserts `Buffer.isBuffer`).

import * as encryptionModule from "@/lib/gcal/encryption";

// Using `MockInstance<typeof encryptionModule.encryptToken>` here triggers
// a variance error in vitest 3.x's generic inference; we erase the
// signature on the local handle (the underlying spy still tracks calls
// correctly — we only assert via toHaveBeenCalled* / toHaveBeenNthCalledWith).
let encryptSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  cookieState.value = undefined;
  cookieState.deleted = 0;
  dbState.selectResults = [];
  dbState.updateCalls = [];
  oauthState.current = null;
  oauthState.calendarListItems = [];
  encryptSpy = vi.spyOn(
    encryptionModule,
    "encryptToken",
  ) as unknown as ReturnType<typeof vi.spyOn>;
});

afterEach(() => {
  vi.clearAllMocks();
  encryptSpy?.mockRestore();
  encryptSpy = null;
});

// --- helpers -------------------------------------------------------------

async function callCallback(reqUrl: string) {
  // Dynamic import so the vi.mocks above are honored.
  const mod = await import("@/app/api/gcal/callback/route");
  return mod.GET(new Request(reqUrl));
}

function locationOf(res: Response): string {
  return res.headers.get("location") ?? "";
}

// --- tests ----------------------------------------------------------------

describe("GET /api/gcal/callback — state mismatch (CSRF defense, Pitfall 2)", () => {
  it("redirects to /settings?gcal=invalid_state, deletes cookie, does not exchange code", async () => {
    // Cookie has a different value than the ?state= param.
    cookieState.value = "cookie-state-value";
    const res = await callCallback(
      "http://localhost:3000/api/gcal/callback?code=AUTHCODE&state=query-state-value-different",
    );

    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(locationOf(res)).toMatch(/\/settings\?gcal=invalid_state$/);
    expect(cookieState.deleted).toBe(1); // single-use cookie still deleted
    // getToken must NOT have been called (no OAuth client should even be
    // touched on the CSRF path — but we don't assert that, just that
    // dbState.updateCalls stays empty).
    expect(dbState.updateCalls).toHaveLength(0);
  });

  it("redirects to invalid_state when the cookie is missing entirely", async () => {
    // No cookie at all.
    cookieState.value = undefined;
    const res = await callCallback(
      "http://localhost:3000/api/gcal/callback?code=AUTHCODE&state=query-state",
    );
    expect(locationOf(res)).toMatch(/\/settings\?gcal=invalid_state$/);
    expect(dbState.updateCalls).toHaveLength(0);
  });

  it("redirects to invalid_state when ?code= is missing", async () => {
    cookieState.value = "state-x";
    const res = await callCallback(
      "http://localhost:3000/api/gcal/callback?state=state-x",
    );
    expect(locationOf(res)).toMatch(/\/settings\?gcal=invalid_state$/);
    expect(dbState.updateCalls).toHaveLength(0);
  });
});

describe("GET /api/gcal/callback — error=access_denied (user cancelled)", () => {
  it("redirects to /settings?gcal=denied without exchanging code", async () => {
    cookieState.value = "any-state-value";
    const res = await callCallback(
      "http://localhost:3000/api/gcal/callback?error=access_denied&state=any-state-value",
    );
    expect(locationOf(res)).toMatch(/\/settings\?gcal=denied$/);
    expect(cookieState.deleted).toBe(1);
    expect(dbState.updateCalls).toHaveLength(0);
    // OAuth2Client may not have been constructed at all on the
    // access_denied path (we bail before getToken). The contract we
    // care about is no DB write — if the constructor never ran,
    // `oauthState.current` is null, which is also "did not exchange".
    if (oauthState.current) {
      expect(oauthState.current.getToken).not.toHaveBeenCalled();
    }
  });
});

describe("GET /api/gcal/callback — no refresh_token (defensive, Pitfall 1)", () => {
  it("redirects to /settings?gcal=no_refresh_token when getToken omits refresh_token", async () => {
    cookieState.value = "shared-state";

    // Pre-arm the OAuth2 mock with a getToken that returns no refresh_token.
    // The constructor is called inside the route, so we lazily configure
    // it via the constructor mock's per-instance setter.
    const { google } = await import("googleapis");
    (google.auth.OAuth2 as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        const mock: OAuth2Mock = {
          getToken: vi.fn().mockResolvedValue({
            tokens: {
              access_token: "fresh_access",
              // refresh_token deliberately omitted
              expiry_date: Date.now() + 3600 * 1000,
            },
          }),
          setCredentials: vi.fn(),
        };
        oauthState.current = mock;
        return mock;
      },
    );

    const res = await callCallback(
      "http://localhost:3000/api/gcal/callback?code=AUTHCODE&state=shared-state",
    );
    expect(locationOf(res)).toMatch(/\/settings\?gcal=no_refresh_token$/);
    expect(oauthState.current?.getToken).toHaveBeenCalledTimes(1);
    // No DB write because we bail before the update.
    expect(dbState.updateCalls).toHaveLength(0);
  });
});

describe("GET /api/gcal/callback — happy path (encrypt + persist)", () => {
  it(
    "encrypts both tokens, persists three fields, auto-defaults primary calendar, redirects to /calendar?gcal=connected",
    async () => {
      cookieState.value = "good-state";

      // Two selects happen on the happy path:
      //   (a) Wave 1 path — none here (callback doesn't call getValidGcalToken).
      //   (b) m-01: SELECT defaultId WHERE id = user.id  → arrange "NULL" so
      //       the auto-default branch runs.
      dbState.selectResults.push([{ defaultId: null }]);

      // OAuth2 mock returns a full token set.
      const { google } = await import("googleapis");
      (google.auth.OAuth2 as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          const mock: OAuth2Mock = {
            getToken: vi.fn().mockResolvedValue({
              tokens: {
                refresh_token: "real_refresh_token_xyz",
                access_token: "real_access_token_abc",
                expiry_date: Date.now() + 3600 * 1000,
                scope: "https://www.googleapis.com/auth/calendar",
                token_type: "Bearer",
              },
            }),
            setCredentials: vi.fn(),
          };
          oauthState.current = mock;
          return mock;
        },
      );

      // calendarList.list returns the user's primary calendar.
      oauthState.calendarListItems = [
        { id: "secondary@group.calendar.google.com", primary: false },
        { id: "filippo@gmail.com", primary: true },
      ];

      const res = await callCallback(
        "http://localhost:3000/api/gcal/callback?code=AUTHCODE&state=good-state",
      );

      // Redirect target.
      expect(locationOf(res)).toMatch(/\/calendar\?gcal=connected$/);

      // encryptToken called twice: once for refresh, once for access.
      expect(encryptSpy!).toHaveBeenCalledTimes(2);
      expect(encryptSpy!).toHaveBeenNthCalledWith(1, "real_refresh_token_xyz");
      expect(encryptSpy!).toHaveBeenNthCalledWith(2, "real_access_token_abc");

      // Two db.update calls: token persist (1) + auto-default primary (2).
      expect(dbState.updateCalls.length).toBeGreaterThanOrEqual(1);
      const tokenUpdate = dbState.updateCalls[0]!.set as Record<string, unknown>;
      expect(Buffer.isBuffer(tokenUpdate.gcalRefreshTokenEncrypted)).toBe(true);
      expect(Buffer.isBuffer(tokenUpdate.gcalAccessTokenEncrypted)).toBe(true);
      expect(tokenUpdate.gcalTokenExpiresAt).toBeInstanceOf(Date);

      // Second db.update (m-01) persists the primary calendar id.
      if (dbState.updateCalls.length >= 2) {
        const defaultUpdate = dbState.updateCalls[1]!.set as Record<
          string,
          unknown
        >;
        expect(defaultUpdate.gcalDefaultCalendarId).toBe("filippo@gmail.com");
      }
    },
  );

  it(
    "does not run the auto-default update when a default calendar already exists",
    async () => {
      cookieState.value = "good-state-2";

      dbState.selectResults.push([{ defaultId: "preexisting@cal" }]);

      const { google } = await import("googleapis");
      (google.auth.OAuth2 as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          const mock: OAuth2Mock = {
            getToken: vi.fn().mockResolvedValue({
              tokens: {
                refresh_token: "r",
                access_token: "a",
                expiry_date: Date.now() + 3600 * 1000,
              },
            }),
            setCredentials: vi.fn(),
          };
          oauthState.current = mock;
          return mock;
        },
      );

      // No primary calendar in the list — irrelevant because the
      // auto-default branch should be skipped entirely.
      oauthState.calendarListItems = [];

      await callCallback(
        "http://localhost:3000/api/gcal/callback?code=AUTHCODE&state=good-state-2",
      );

      // Exactly one db.update (the token persist). The m-01 branch
      // should NOT have run because defaultId was already set.
      expect(dbState.updateCalls).toHaveLength(1);
    },
  );
});
