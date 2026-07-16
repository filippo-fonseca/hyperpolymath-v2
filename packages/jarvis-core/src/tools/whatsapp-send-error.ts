// Shared classification of a WhatsApp send failure into the THREE distinct
// user-facing categories the send path must never conflate (real-world bug:
// a contact-resolution failure was reported as "WhatsApp not connected").
//
//   not_connected → the bridge/WhatsApp session is down (unpaired, logged out,
//                   process unreachable, or a send timeout). A connectivity
//                   problem — the fix is to pair/reconnect.
//   not_found     → the bridge is up but no contact matched the name. A
//                   resolution problem — the fix is a different/fuller name.
//   ambiguous     → several contacts matched. Ask which one; never guess.
//
// This module is pure (no I/O, no Tauri/DOM deps) so it can be unit-tested in
// jarvis-core and imported by the desktop confirm-gate. The desktop maps a
// bridge HTTP response (status + parsed JSON body) into one of these, then
// speaks the matching line. The Go bridge tags each error body with a machine
// `code` field ("not_connected" | "not_found" | "ambiguous"); we prefer that
// code and fall back to status + message-shape heuristics for older bridges.

export type WhatsappSendErrorCategory =
  | "not_connected"
  | "not_found"
  | "ambiguous"
  // The bridge is up and a contact resolved, but that recipient can't actually
  // receive a WhatsApp message (number not registered, or an unroutable @lid).
  // WhatsApp would otherwise ACCEPT the send and silently drop it — distinct
  // from "couldn't find" so the user knows the person, not the lookup, is the
  // problem.
  | "not_on_whatsapp";

/** The transport-level outcome the desktop observed BEFORE (or instead of)
 *  reading a response body. `ok` never reaches the classifier; the rest map to
 *  connectivity problems, EXCEPT `http_error` which carries a real response we
 *  then inspect for a resolution `code`. */
export type WhatsappSendTransport =
  | "http_error" // got an HTTP response with a non-2xx status + (maybe) a body
  | "timeout" // request aborted on our client-side deadline
  | "unreachable"; // could not open a connection to the bridge at all

export interface WhatsappBridgeErrorBody {
  ok?: boolean;
  /** Machine tag emitted by the Go bridge (preferred signal). */
  code?: string;
  error?: string;
  query?: string;
  /** For ambiguous: human-readable candidate labels ("MAMMA (…)", …). */
  candidates?: string[];
}

export interface WhatsappSendClassification {
  category: WhatsappSendErrorCategory;
  /** Candidate labels when the bridge reported an ambiguous match. */
  candidates?: string[];
}

/** Normalize a bridge `code` string to one of our categories, if recognized. */
function categoryFromCode(code: string | undefined): WhatsappSendErrorCategory | null {
  switch ((code ?? "").toLowerCase()) {
    case "not_connected":
    case "not_logged_in":
    case "logged_out":
      return "not_connected";
    case "not_found":
    case "invalid_recipient": // a malformed recipient is a resolution problem, not connectivity
      return "not_found";
    case "ambiguous":
      return "ambiguous";
    case "not_on_whatsapp":
      return "not_on_whatsapp";
    default:
      return null;
  }
}

/** Heuristic fallback for an older bridge with no `code` field: read the error
 *  text shape. "ambiguous" and "no … contact matches" are unmistakable; a
 *  "not logged in" / "not paired" message is connectivity. */
function categoryFromMessage(message: string | undefined): WhatsappSendErrorCategory | null {
  const m = (message ?? "").toLowerCase();
  if (!m) return null;
  if (m.includes("ambiguous")) return "ambiguous";
  if (m.includes("not reachable on whatsapp") || m.includes("not on whatsapp")) {
    return "not_on_whatsapp";
  }
  if (
    m.includes("no whatsapp contact") ||
    m.includes("contact matches") ||
    m.includes("not found") ||
    m.includes("invalid recipient")
  ) {
    return "not_found";
  }
  if (
    m.includes("not logged in") ||
    m.includes("logged out") ||
    m.includes("scan the qr") ||
    m.includes("not paired") ||
    m.includes("not connected")
  ) {
    return "not_connected";
  }
  return null;
}

/**
 * Classify a WhatsApp send failure. Precedence:
 *   1. transport `timeout`/`unreachable` → always `not_connected` (we never
 *      reached the bridge, so no resolution verdict is possible).
 *   2. an explicit bridge `code`.
 *   3. an error-message heuristic.
 *   4. HTTP status: 5xx → not_connected (bridge unhappy), else not_found
 *      (a 4xx from a live bridge is a resolution/validation problem).
 */
export function classifyWhatsappSendError(
  transport: WhatsappSendTransport,
  status: number | undefined,
  body: WhatsappBridgeErrorBody | undefined,
): WhatsappSendClassification {
  if (transport === "timeout" || transport === "unreachable") {
    return { category: "not_connected" };
  }

  const byCode = categoryFromCode(body?.code);
  if (byCode) {
    return byCode === "ambiguous"
      ? { category: byCode, candidates: body?.candidates }
      : { category: byCode };
  }

  const byMessage = categoryFromMessage(body?.error);
  if (byMessage) {
    return byMessage === "ambiguous"
      ? { category: byMessage, candidates: body?.candidates }
      : { category: byMessage };
  }

  // Status-only fallback. 502/503/504 (and any 5xx) are the bridge itself being
  // unreachable/unhealthy → connectivity. A live bridge returning 4xx means it
  // processed the request and rejected the recipient → resolution failure.
  if (typeof status === "number" && status >= 500) {
    return { category: "not_connected" };
  }
  return { category: "not_found" };
}

/** Build the SPOKEN failure line for a classified send error, in JARVIS's
 *  voice ("…, sir."). `recipient` is the name the user said; `candidates` (when
 *  present, for ambiguous) are woven into a short "did you mean" suggestion. */
export function whatsappSendFailureLine(
  classification: WhatsappSendClassification,
  recipient: string,
): string {
  const who = recipient.trim() || "them";
  switch (classification.category) {
    case "not_connected":
      return "WhatsApp isn't connected, sir — you'll need to re-link it before I can send that.";
    case "not_found":
      return `I couldn't find a contact matching ${who} on WhatsApp, sir.`;
    case "not_on_whatsapp":
      return `I found ${who}, sir, but that contact doesn't appear to be reachable on WhatsApp — the message wouldn't go through.`;
    case "ambiguous": {
      const cands = (classification.candidates ?? [])
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (cands.length >= 2) {
        return `There's more than one match for ${who} on WhatsApp, sir — did you mean ${cands.join(
          ", or ",
        )}?`;
      }
      return `There's more than one match for ${who} on WhatsApp, sir — which one did you mean?`;
    }
  }
}
