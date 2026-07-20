import { describe, expect, it } from "vitest";
import {
  RequestSerializer,
  computeBackoffDelayMs,
  isNonRetryableStatus,
  parseRetryAfterMs,
  withRetry,
} from "../rate-limit";

describe("rate-limit helpers", () => {
  it("flags non-retryable HTTP statuses", () => {
    expect(isNonRetryableStatus(400)).toBe(true);
    expect(isNonRetryableStatus(401)).toBe(true);
    expect(isNonRetryableStatus(404)).toBe(true);
    expect(isNonRetryableStatus(429)).toBe(false);
  });

  it("parses Retry-After seconds", () => {
    expect(parseRetryAfterMs("2")).toBe(2_000);
  });

  it("computes bounded exponential backoff", () => {
    const delay = computeBackoffDelayMs(2, { baseDelayMs: 100, maxDelayMs: 1_000 });
    expect(delay).toBeGreaterThanOrEqual(400);
    expect(delay).toBeLessThanOrEqual(1_250);
  });

  it("serializes concurrent runs", async () => {
    const serializer = new RequestSerializer();
    const order: number[] = [];

    await Promise.all([
      serializer.run(async () => {
        order.push(1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(2);
      }),
      serializer.run(async () => {
        order.push(3);
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("retries until success", async () => {
    let attempts = 0;
    const sleeps: number[] = [];

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error("rate limited"), { status: 429 });
        return "ok";
      },
      {
        shouldRetry: (error) => (error as { status?: number }).status === 429,
        getRetryAfterMs: () => 5,
        sleepFn: async (ms) => {
          sleeps.push(ms);
        },
        retryOptions: { maxRetries: 3 },
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([5, 5]);
  });
});
