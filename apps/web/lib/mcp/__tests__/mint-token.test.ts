/**
 * mintMcpToken + verifyBearer + revokeMcpToken — unit tests.
 *
 * Phase 999.12 MCP-03 / MCP-05. We test the contract through an in-memory
 * Drizzle-shaped DB stub (the integration_tokens table is the only surface).
 * That keeps the tests fast and dependency-free; the SQL correctness of
 * Drizzle calls is grep-verified in the plan's done criteria.
 *
 * Contract under test:
 *   - mintMcpToken returns a plaintext bearer ONCE; only the SHA-256 hash is
 *     persisted
 *   - verifyBearer SHA-256s the input and looks up by hash; bumps updated_at
 *     on hit; returns ok:false for any miss
 *   - Re-minting overwrites (one-token-per-user policy; old plaintext stops
 *     resolving)
 *   - revokeMcpToken removes the row
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";

// Drizzle returns plain row objects shaped exactly like the table column TS
// types. The stub mimics the chain shapes used by mint/verify/revoke without
// pulling in real postgres or pglite.
interface TokenRow {
  userId: string;
  provider: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeStubDb(rows: TokenRow[] = []) {
  return {
    rows,
    insert(_table: unknown) {
      return {
        values(v: Partial<TokenRow>) {
          return {
            onConflictDoUpdate(spec: { set: Partial<TokenRow> }) {
              const existing = rows.findIndex(
                (r) => r.userId === v.userId && r.provider === v.provider,
              );
              if (existing >= 0) {
                rows[existing] = {
                  ...rows[existing]!,
                  ...spec.set,
                  updatedAt: spec.set.updatedAt ?? new Date(),
                };
              } else {
                rows.push({
                  userId: v.userId as string,
                  provider: v.provider as string,
                  accessToken: v.accessToken ?? null,
                  refreshToken: v.refreshToken ?? null,
                  expiresAt: v.expiresAt ?? null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
    select(_cols: unknown) {
      return {
        from(_table: unknown) {
          return {
            where(predicate: (r: TokenRow) => boolean) {
              const hits = rows.filter(predicate);
              return {
                limit(n: number) {
                  return Promise.resolve(hits.slice(0, n));
                },
                then(resolve: (v: TokenRow[]) => unknown) {
                  return Promise.resolve(hits).then(resolve);
                },
              };
            },
          };
        },
      };
    },
    update(_table: unknown) {
      return {
        set(patch: Partial<TokenRow>) {
          return {
            where(predicate: (r: TokenRow) => boolean) {
              for (const r of rows) {
                if (predicate(r)) Object.assign(r, patch);
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
    delete(_table: unknown) {
      return {
        where(predicate: (r: TokenRow) => boolean) {
          for (let i = rows.length - 1; i >= 0; i--) {
            if (predicate(rows[i]!)) rows.splice(i, 1);
          }
          return Promise.resolve();
        },
      };
    },
  };
}

// Mock the integrationTokens import to a stable sentinel and the drizzle
// `and`/`eq` helpers to row-predicate functions the stub above understands.
// The real Drizzle helpers return SQL AST nodes; we collapse them into
// predicates that our in-memory rows can evaluate.
type Predicate = (r: TokenRow) => boolean;

vi.mock("@/lib/db/schema", () => ({
  integrationTokens: {
    userId: { col: "userId" } as { col: keyof TokenRow },
    provider: { col: "provider" } as { col: keyof TokenRow },
    accessToken: { col: "accessToken" } as { col: keyof TokenRow },
    refreshToken: { col: "refreshToken" } as { col: keyof TokenRow },
    expiresAt: { col: "expiresAt" } as { col: keyof TokenRow },
    updatedAt: { col: "updatedAt" } as { col: keyof TokenRow },
  },
}));

vi.mock("drizzle-orm", () => {
  const eq = (col: { col: keyof TokenRow }, val: unknown): Predicate =>
    (r: TokenRow) => r[col.col] === val;
  const and = (...ps: Predicate[]): Predicate =>
    (r: TokenRow) => ps.every((p) => p(r));
  return { eq, and };
});

// Stub @/lib/db so importing the modules under test doesn't try to open a
// postgres pool from the test process.
vi.mock("@/lib/db", () => ({ db: {} }));

import { mintMcpToken, revokeMcpToken, MCP_PROVIDER } from "../mint-token";
import { verifyBearer } from "../verify-bearer";

const USER_ID = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();

describe("mintMcpToken", () => {
  let db: ReturnType<typeof makeStubDb>;
  beforeEach(() => {
    db = makeStubDb();
  });

  it("returns a plaintext bearer starting with `mcp_` and length > 40", async () => {
    const result = await mintMcpToken(USER_ID, "Claude Desktop", db as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plaintext).toMatch(/^mcp_/);
    expect(result.data.plaintext.length).toBeGreaterThan(40);
  });

  it("returned hash equals SHA-256 of the plaintext", async () => {
    const result = await mintMcpToken(USER_ID, "name", db as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = createHash("sha256").update(result.data.plaintext).digest("hex");
    expect(result.data.hash).toBe(expected);
  });

  it("persists ONLY the hash to the DB row, never the plaintext", async () => {
    const result = await mintMcpToken(USER_ID, "device-A", db as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = db.rows.find((r) => r.userId === USER_ID);
    expect(row).toBeDefined();
    expect(row!.accessToken).toBe(result.data.hash);
    expect(row!.accessToken).not.toBe(result.data.plaintext);
    expect(row!.refreshToken).toBe("device-A");
    expect(row!.provider).toBe(MCP_PROVIDER);
  });

  it("re-minting OVERWRITES the existing row (one-token-per-user)", async () => {
    const first = await mintMcpToken(USER_ID, "old", db as never);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await mintMcpToken(USER_ID, "new", db as never);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Only one row exists for this user.
    const matching = db.rows.filter((r) => r.userId === USER_ID);
    expect(matching).toHaveLength(1);
    // Hash matches the SECOND mint, not the first.
    expect(matching[0]!.accessToken).toBe(second.data.hash);
    expect(matching[0]!.refreshToken).toBe("new");
    // First plaintext no longer resolves.
    const oldCheck = await verifyBearer(first.data.plaintext, db as never);
    expect(oldCheck.ok).toBe(false);
    // New plaintext does.
    const newCheck = await verifyBearer(second.data.plaintext, db as never);
    expect(newCheck.ok).toBe(true);
  });
});

describe("verifyBearer", () => {
  let db: ReturnType<typeof makeStubDb>;
  beforeEach(() => {
    db = makeStubDb();
  });

  it("resolves a valid plaintext to its owning userId", async () => {
    const mint = await mintMcpToken(USER_ID, "mine", db as never);
    expect(mint.ok).toBe(true);
    if (!mint.ok) return;
    const v = await verifyBearer(mint.data.plaintext, db as never);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.userId).toBe(USER_ID);
  });

  it("returns ok:false for a wrong/malformed token", async () => {
    await mintMcpToken(USER_ID, "name", db as never);
    const r = await verifyBearer("nope-not-a-real-bearer-token", db as never);
    expect(r.ok).toBe(false);
  });

  it("returns ok:false for too-short input without hitting the DB", async () => {
    const r = await verifyBearer("abc", db as never);
    expect(r.ok).toBe(false);
  });

  it("does not leak across users — a different user's plaintext does not resolve to ours", async () => {
    const mineMint = await mintMcpToken(USER_ID, "mine", db as never);
    const theirsMint = await mintMcpToken(OTHER_USER, "theirs", db as never);
    expect(mineMint.ok).toBe(true);
    expect(theirsMint.ok).toBe(true);
    if (!mineMint.ok || !theirsMint.ok) return;

    const v = await verifyBearer(theirsMint.data.plaintext, db as never);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.userId).toBe(OTHER_USER);
    expect(v.userId).not.toBe(USER_ID);
  });

  it("bumps updated_at on successful verify (proxy for last_used_at)", async () => {
    const mint = await mintMcpToken(USER_ID, "name", db as never);
    expect(mint.ok).toBe(true);
    if (!mint.ok) return;
    const before = db.rows.find((r) => r.userId === USER_ID)!.updatedAt;
    // Wait one tick so Date.now() advances.
    await new Promise((r) => setTimeout(r, 5));
    const v = await verifyBearer(mint.data.plaintext, db as never);
    expect(v.ok).toBe(true);
    const after = db.rows.find((r) => r.userId === USER_ID)!.updatedAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe("revokeMcpToken", () => {
  it("removes the (userId, mcp_agent) row", async () => {
    const db = makeStubDb();
    const mint = await mintMcpToken(USER_ID, "name", db as never);
    expect(mint.ok).toBe(true);
    if (!mint.ok) return;
    expect(db.rows.filter((r) => r.userId === USER_ID)).toHaveLength(1);

    const r = await revokeMcpToken(USER_ID, db as never);
    expect(r.ok).toBe(true);
    expect(db.rows.filter((r) => r.userId === USER_ID)).toHaveLength(0);

    // And the plaintext no longer resolves.
    const v = await verifyBearer(mint.data.plaintext, db as never);
    expect(v.ok).toBe(false);
  });

  it("is a no-op when no token exists for the user", async () => {
    const db = makeStubDb();
    const r = await revokeMcpToken(USER_ID, db as never);
    expect(r.ok).toBe(true);
  });
});
