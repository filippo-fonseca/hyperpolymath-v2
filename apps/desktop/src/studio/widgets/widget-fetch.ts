export interface ExecutorSuccess<T extends Record<string, unknown>> {
  ok: true;
  id: string;
  receipt: T;
}

export interface ExecutorFailure {
  ok: false;
  error: string;
}

export type ExecutorResponse<T extends Record<string, unknown>> =
  | ExecutorSuccess<T>
  | ExecutorFailure;

export async function fetchStudioWidget<T extends Record<string, unknown>>(
  endpoint: string,
): Promise<T> {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Widget request failed (${response.status})`);
  }
  const result = (await response.json()) as ExecutorResponse<T>;
  if (!result.ok) throw new Error(result.error);
  return result.receipt;
}
