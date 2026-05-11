import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase auth so getClaims() returns a known value; expose as a spy
// for M5 assertion ("getClaims is actually invoked").
const getClaimsSpy = vi.fn().mockResolvedValue({
  data: { claims: { sub: "11111111-1111-1111-1111-111111111111" } },
  error: null,
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: getClaimsSpy,
    },
  }),
}));

// Capture the .values() call to assert id is propagated.
// Drizzle chain: db.insert(table).values(payload).returning({ id }) returns rows.
// db.select(...).from(...).where(...) returns rows.
const valuesSpy = vi.fn().mockReturnValue({
  returning: async () => [{ id: "captured" }],
});
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [{ maxOrder: -1 }],
      }),
    }),
    insert: () => ({ values: valuesSpy }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({ values: valuesSpy }),
        select: () => ({
          from: () => ({
            where: async () => [],
          }),
        }),
      }),
  },
}));

// Import AFTER mocks are registered
import { createArea } from "@/app/actions/areas";

describe("RT-05 — server actions respect caller-supplied UUID + use getClaims auth (CLAUDE.md Critical Pattern 1)", () => {
  beforeEach(() => {
    valuesSpy.mockClear();
    getClaimsSpy.mockClear();
  });

  it("createArea uses caller-supplied id when valid", async () => {
    const callerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await createArea({ id: callerId, name: "Yale" });
    const valuesArg = valuesSpy.mock.calls.at(-1)?.[0];
    expect(valuesArg?.id).toBe(callerId);
  });

  it("createArea generates a server-side id when caller omits it (backwards compat)", async () => {
    await createArea({ name: "Stanford" });
    const valuesArg = valuesSpy.mock.calls.at(-1)?.[0];
    expect(valuesArg?.id).toBeUndefined();
  });

  it("createArea invokes getClaims for auth (M5 — confirms CLAUDE.md-compliant auth pattern)", async () => {
    await createArea({ name: "Princeton" });
    expect(getClaimsSpy).toHaveBeenCalled();
  });
});
