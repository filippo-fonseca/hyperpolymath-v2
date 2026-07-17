import { afterEach, describe, expect, it } from "vitest";
import { isReferencesSemanticEnabled } from "@/lib/references/semantic-flag";

/**
 * The one gate for the whole staged rung. Default OFF is the contract: every
 * semantic entry point (write-path enqueue, semantic search action, dropdown's
 * second call) reads this and no-ops when it's false, so anything but the exact
 * literal "true" must degrade to the safe exact-only path.
 */

const original = process.env.REFERENCES_SEMANTIC_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.REFERENCES_SEMANTIC_ENABLED;
  else process.env.REFERENCES_SEMANTIC_ENABLED = original;
});

describe("isReferencesSemanticEnabled", () => {
  it("is off when the env var is unset", () => {
    delete process.env.REFERENCES_SEMANTIC_ENABLED;
    expect(isReferencesSemanticEnabled()).toBe(false);
  });

  it("is on only for the exact literal \"true\"", () => {
    process.env.REFERENCES_SEMANTIC_ENABLED = "true";
    expect(isReferencesSemanticEnabled()).toBe(true);
  });

  it("degrades off for empty, malformed, or near-miss values", () => {
    for (const value of ["", "false", "TRUE", "True", "1", "yes", " true ", "0"]) {
      process.env.REFERENCES_SEMANTIC_ENABLED = value;
      expect(isReferencesSemanticEnabled()).toBe(false);
    }
  });
});
