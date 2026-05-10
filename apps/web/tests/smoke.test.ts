import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest harness runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("env vars are typed and accessible", () => {
    // Sanity check that Vite reads process.env in test runs
    expect(typeof process.env.NODE_ENV).toBe("string");
  });
});
