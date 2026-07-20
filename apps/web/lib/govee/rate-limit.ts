export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8_000;

export function isNonRetryableStatus(status?: number): boolean {
  return status === 400 || status === 401 || status === 404;
}

export function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

export function computeBackoffDelayMs(attempt: number, options?: RetryOptions): number {
  const base = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const max = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const exponential = Math.min(max, base * 2 ** attempt);
  const jitter = Math.random() * exponential * 0.25;
  return Math.floor(exponential + jitter);
}

/** Serializes async work so only one task runs at a time. */
export class RequestSerializer {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface RetryContext {
  attempt: number;
  retryAfterMs?: number;
}

export async function withRetry<T>(
  fn: (context: RetryContext) => Promise<T>,
  options: {
    shouldRetry: (error: unknown, context: RetryContext) => boolean;
    getRetryAfterMs?: (error: unknown) => number | undefined;
    retryOptions?: RetryOptions;
    sleepFn?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const maxRetries = options.retryOptions?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleepFn = options.sleepFn ?? sleep;

  for (let attempt = 0; ; attempt++) {
    const context: RetryContext = { attempt };
    try {
      return await fn(context);
    } catch (error) {
      if (!options.shouldRetry(error, context) || attempt >= maxRetries) {
        throw error;
      }
      const retryAfterMs =
        options.getRetryAfterMs?.(error) ?? computeBackoffDelayMs(attempt, options.retryOptions);
      await sleepFn(retryAfterMs);
    }
  }
}
