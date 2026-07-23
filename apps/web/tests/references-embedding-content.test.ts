import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  EMBEDDING_INPUT_MAX_CHARS,
  embeddingContentHash,
  normalizeEmbeddingInput,
} from "@/lib/references/embedding-content";

/**
 * These pin the single normalization + hash the U7 short-circuit depends on. The
 * edge function embeds the SAME normalized string and stores sha256(content), so
 * if this logic drifts the two hashes stop agreeing and every save re-embeds (or
 * worse, silently keeps a stale vector). The determinism cases are the contract
 * the web side and the function share.
 */

describe("normalizeEmbeddingInput", () => {
  it("leads with the title, then the body", () => {
    expect(normalizeEmbeddingInput("Marathon", "training log")).toBe(
      "marathon training log",
    );
  });

  it("lowercases and collapses every run of whitespace to one space", () => {
    expect(normalizeEmbeddingInput("  Ship  IT ", "now\n\n  please\t")).toBe(
      "ship it now please",
    );
  });

  it("drops a nullish or empty part instead of leaving a gap", () => {
    expect(normalizeEmbeddingInput(null, "body only")).toBe("body only");
    expect(normalizeEmbeddingInput("title only", null)).toBe("title only");
    expect(normalizeEmbeddingInput("title only", "")).toBe("title only");
    expect(normalizeEmbeddingInput(undefined, "  ")).toBe("");
  });

  it("returns empty string when there is nothing meaning-bearing", () => {
    // Its caller treats "" as "don't embed" — an untitled, empty entity.
    expect(normalizeEmbeddingInput(null, null)).toBe("");
    expect(normalizeEmbeddingInput("   ", "\n\t ")).toBe("");
  });

  it("caps the result at EMBEDDING_INPUT_MAX_CHARS", () => {
    const long = normalizeEmbeddingInput("a".repeat(5000), "b".repeat(5000));
    expect(long).toHaveLength(EMBEDDING_INPUT_MAX_CHARS);
    expect(long).toBe("a".repeat(EMBEDDING_INPUT_MAX_CHARS));
  });

  it("is stable: the same inputs always normalize identically", () => {
    const a = normalizeEmbeddingInput("Weekly  Review", "notes\nhere");
    const b = normalizeEmbeddingInput("Weekly  Review", "notes\nhere");
    expect(a).toBe(b);
  });
});

describe("embeddingContentHash", () => {
  it("is hex sha256 of the normalized string (mirrors the edge function)", () => {
    const normalized = normalizeEmbeddingInput("Marathon", "training log");
    const expected = createHash("sha256").update(normalized, "utf8").digest("hex");
    expect(embeddingContentHash(normalized)).toBe(expected);
    expect(embeddingContentHash(normalized)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — the property the short-circuit relies on", () => {
    expect(embeddingContentHash("marathon training log")).toBe(
      embeddingContentHash("marathon training log"),
    );
  });

  it("distinguishes different content", () => {
    expect(embeddingContentHash("marathon")).not.toBe(
      embeddingContentHash("marathon "),
    );
    expect(embeddingContentHash("a")).not.toBe(embeddingContentHash("b"));
  });

  it("short-circuits an unchanged entity: re-normalizing yields the same hash", () => {
    // A due-date-only edit doesn't change (title, body), so the enqueue must see
    // the same hash and skip the embed round trip.
    const first = embeddingContentHash(normalizeEmbeddingInput("Task", "do the thing"));
    const afterUnrelatedEdit = embeddingContentHash(
      normalizeEmbeddingInput("Task", "do the thing"),
    );
    expect(afterUnrelatedEdit).toBe(first);

    const afterRealEdit = embeddingContentHash(
      normalizeEmbeddingInput("Task", "do the OTHER thing"),
    );
    expect(afterRealEdit).not.toBe(first);
  });
});
