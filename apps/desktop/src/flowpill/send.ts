/**
 * send.ts — the last step: the transcript becomes a message in the JARVIS
 * conversation.
 *
 * `POST /api/jarvis/voice/text` with `{ text }` and the desktop bearer. That
 * route runs the real turn through `lib/jarvis/run-channel-turn.ts`, which
 * persists to `jarvis_turns`, which the web console reads over realtime. So the
 * user's sentence and JARVIS's reply appear in the **web** conversation, with no
 * refresh, which is the entire point of this feature.
 *
 * Nothing here reads the response body beyond its status. The pill is INPUT
 * ONLY: it does not render the reply, and it certainly does not speak it.
 *
 * No route is added, modified or extended. The auth headers mirror `authHeaders`
 * in `@/api/client`, with one deliberate omission documented below.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { getDeviceToken } from "@/auth/device-token";
import { getEnv } from "@/env";

/** The outcome of one send. Never throws at the caller. */
export type SendResult =
  | { kind: "sent" }
  | { kind: "failed"; message: string; status?: number };

/** The slice of `fetch` this module uses, kept minimal so tests can stub it. */
export type SendFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export interface SendDeps {
  fetchImpl?: SendFetch;
  /** Returns the device bearer, or null when the desktop has not been paired. */
  deviceToken?: () => Promise<string | null>;
  triggerSecret?: string;
  apiBaseUrl?: string;
}

/**
 * Copy for the one failure the user can actually do something about. The route
 * is gated on `validateDesktopBearerIdentity`, so without a token every send is
 * a 401. Saying "not paired" is more use than saying "401".
 */
export const NOT_PAIRED = "Desktop not paired";

/** Short, honest copy for a failed send. The pill has one line to say it in. */
export const SEND_FAILED = "Couldn't reach JARVIS";

/**
 * Post the transcript as a normal user message.
 *
 * The empty guard here is the last of three (the capture path reports silence
 * and blank transcripts distinctly, and the pill's reducer refuses whitespace).
 * It is deliberate belt and braces: an empty message posted to JARVIS runs a
 * turn on nothing and is worse than doing nothing at all, and this is the only
 * function in the feature that can actually cause it.
 *
 * One attempt, no retry. A network failure is quiet by contract: the pill shows
 * a short error and fades. The user is dictating over the top of another
 * application and does not want to be interrupted twice.
 */
export async function sendFlowpillText(
  text: string,
  deps: SendDeps = {},
): Promise<SendResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: "failed", message: "refusing to post an empty message" };
  }

  const doFetch = deps.fetchImpl ?? (tauriFetch as unknown as SendFetch);
  const readToken = deps.deviceToken ?? getDeviceToken;
  const apiBaseUrl = deps.apiBaseUrl ?? getEnv().apiBaseUrl;
  const triggerSecret = deps.triggerSecret ?? getEnv().triggerSecret;

  const token = await readToken();
  if (!token) return { kind: "failed", message: NOT_PAIRED };

  // `x-jarvis-mode: computer` is deliberately NOT sent. The HUD's turn entry
  // points send it so the backend appends its computer-control steering block.
  // The pill is a dictation surface used from inside somebody else's
  // application; the user is composing a message, not driving this machine, and
  // the reply is read in the web console. The legacy trigger secret rides along
  // exactly as `@/api/client` sends it, but the bearer is what this route
  // actually validates.
  const headers: Record<string, string> = {
    "x-trigger-secret": triggerSecret,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };

  try {
    const res = await doFetch(`${apiBaseUrl}/api/jarvis/voice/text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: trimmed }),
    });
    if (!res.ok) {
      return { kind: "failed", message: SEND_FAILED, status: res.status };
    }
    return { kind: "sent" };
  } catch {
    return { kind: "failed", message: SEND_FAILED };
  }
}
