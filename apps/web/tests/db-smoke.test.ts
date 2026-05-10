import { describe, it, expect } from "vitest";
import postgres from "postgres";

describe("db connection smoke", () => {
  it("can SELECT 1 against DATABASE_URL with prepare:false", async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      // Skip in CI where local DB isn't running
      console.warn("DATABASE_URL not set — skipping db smoke");
      return;
    }
    const sql = postgres(url, { prepare: false });
    try {
      const result = await sql`SELECT 1 as one`;
      expect(result[0].one).toBe(1);
    } finally {
      await sql.end();
    }
  }, 10_000);
});
