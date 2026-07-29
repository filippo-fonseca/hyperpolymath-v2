// apps/desktop/src/flowpill/audio/transcribe.ts
// Buffer in, transcript out.
//
// POSTs the whole utterance, once, to the EXISTING side-effect-free STT route:
// `POST /api/jarvis/voice/transcript` with `x-jarvis-probe: 1`. That header is
// what makes the call free of consequences: no turn is persisted and no agent
// run is started, so the flowpill can transcribe without JARVIS reacting. What
// happens to the returned string is somebody else's job.
//
// The auth headers mirror `probeTranscript` in `@/api/client` exactly (device
// bearer when present, legacy trigger secret always). No route is added or
// changed here.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { getDeviceToken } from "@/auth/device-token";
import { encodeWav } from "@/audio/encode-wav";
import { getEnv } from "@/env";

/** Outcome of one transcription attempt. Never throws at the caller. */
export type TranscriptionResult =
  | { kind: "transcript"; text: string }
  | { kind: "empty" }
  | { kind: "failed"; message: string; status?: number };

/** The slice of `fetch` this module uses. Kept minimal so tests can stub it. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: Uint8Array;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface TranscribeDeps {
  fetchImpl?: FetchLike;
  authHeaders?: () => Promise<Record<string, string>>;
  apiBaseUrl?: string;
  encode?: (samples: Float32Array, sampleRate: number) => Blob;
}

/**
 * Mirrors `authHeaders` in `@/api/client`: prefer the device bearer minted at
 * /settings/desktop, and always send the legacy trigger secret so the older
 * server path keeps accepting us.
 */
async function defaultAuthHeaders(): Promise<Record<string, string>> {
  const { triggerSecret } = getEnv();
  const headers: Record<string, string> = { "x-trigger-secret": triggerSecret };
  const token = await getDeviceToken();
  if (token) headers["authorization"] = `Bearer ${token}`;
  return headers;
}

function isRetryable(status: number): boolean {
  // Server-side wobble and rate limiting are worth one more go. A 4xx is a
  // verdict, not a hiccup, so it is returned as-is.
  return status >= 500 || status === 429;
}

/**
 * Encode the utterance as 16-bit mono WAV and transcribe it in one request.
 *
 * Retries at most once, and only on a transport error or a retryable status.
 * Anything else comes back as `failed` with whatever detail we have.
 */
export async function transcribeUtterance(
  samples: Float32Array,
  sampleRate: number,
  deps: TranscribeDeps = {},
): Promise<TranscriptionResult> {
  if (samples.length === 0) return { kind: "empty" };

  const encode = deps.encode ?? encodeWav;
  const doFetch = deps.fetchImpl ?? (tauriFetch as unknown as FetchLike);
  const buildHeaders = deps.authHeaders ?? defaultAuthHeaders;
  const baseUrl = deps.apiBaseUrl ?? getEnv().apiBaseUrl;

  const wav = encode(samples, sampleRate);
  const body = new Uint8Array(await wav.arrayBuffer());
  const headers = {
    ...(await buildHeaders()),
    "content-type": "audio/wav",
    "x-jarvis-probe": "1",
  };
  const url = `${baseUrl}/api/jarvis/voice/transcript`;

  let last: TranscriptionResult = {
    kind: "failed",
    message: "transcript request was never attempted",
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      res = await doFetch(url, { method: "POST", headers, body });
    } catch (err) {
      last = {
        kind: "failed",
        message: err instanceof Error ? err.message : "transcript request failed",
      };
      continue; // transport failure: one retry, then give up
    }

    if (!res.ok) {
      last = { kind: "failed", message: `transcript request ${res.status}`, status: res.status };
      if (isRetryable(res.status)) continue;
      return last;
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch (err) {
      return {
        kind: "failed",
        message: err instanceof Error ? err.message : "transcript response was not JSON",
        status: res.status,
      };
    }

    const raw =
      payload && typeof payload === "object" && "transcript" in payload
        ? (payload as { transcript?: unknown }).transcript
        : undefined;
    const text = typeof raw === "string" ? raw.trim() : "";
    return text.length === 0 ? { kind: "empty" } : { kind: "transcript", text };
  }

  return last;
}
