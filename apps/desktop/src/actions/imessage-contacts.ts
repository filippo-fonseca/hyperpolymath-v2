// apps/desktop/src/actions/imessage-contacts.ts
// Name → iMessage handle resolution for the send_message iMessage path.
//
// THE BUG THIS FIXES: Messages.app `send … to participant "<recipient>"` takes
// the recipient string LITERALLY. When the model emits a bare NAME ("Rohan"),
// Messages.app silently resolves it to *some* arbitrary buddy/handle — which is
// how a text once went to a random "Rohan" the user never meant. There is no
// name→handle safety anywhere on the iMessage path (WhatsApp already resolves
// names in its bridge). This module closes that hole: before we ever build the
// AppleScript send, a bare name is resolved to a concrete handle
// (phone/email), and if resolution is ambiguous or empty we ABORT rather than
// send to a guess.
//
// Resolution priority:
//   1. macOS Contacts (authoritative) — queried via osascript running JXA
//      (JavaScript for Automation) against the Contacts app. JXA is required
//      here: AppleScript `tell application "Contacts"` returns -600
//      "Application isn't running" when Contacts isn't already open, whereas
//      the JXA `Application("Contacts").people.whose(...)` form launches it in
//      the background and resolves reliably. Requires the TCC "Contacts"
//      permission; a permission denial is detected and surfaced (never a blind
//      send).
//   2. Recent iMessage threads (tie-breaker / fallback) — the ingested
//      imessage_messages table already carries `senderName` (resolved by the
//      sync worker) alongside the raw `sender` handle. When Contacts returns
//      several candidates we prefer the one the user has actually messaged; when
//      Contacts is unavailable (no permission / no match) we fall back to it.
//
// Injection safety: the name flows into the JXA script ONLY through
// JSON.stringify (a proper JS string literal — no interpolation into code). The
// recent-threads lookup is a parameterized server query.

import { runJxa } from "@/actions/applescript";
import { resolveRecentImessageHandles } from "@/api/client";

/** Outcome of resolving a recipient to a concrete iMessage handle.
 *  - `resolved`   → send to `handle` (exactly one confident match).
 *  - `passthrough`→ recipient was already a phone/email/chat-id; use as-is.
 *  - `ambiguous`  → multiple plausible people; DO NOT send, ask which.
 *  - `not_found`  → no match anywhere; DO NOT send, say so.
 *  - `no_contacts_permission` → macOS Contacts TCC not granted AND recent
 *    threads gave nothing; tell the user to grant access rather than guess. */
export type RecipientResolution =
  | { kind: "resolved"; handle: string }
  | { kind: "passthrough"; handle: string }
  | { kind: "ambiguous"; name: string; candidates: string[] }
  | { kind: "not_found"; name: string }
  | { kind: "no_contacts_permission"; name: string };

/** A recipient that is already a concrete handle needs no resolution:
 *   - a phone number (optional +, digits / spaces / dashes / parens),
 *   - an email address,
 *   - a Messages chat id (handled upstream by isChatId, but matched here too so
 *     a group-chat GUID never gets treated as a name to look up).
 *  Anything else is treated as a NAME and must be resolved before sending. */
export function isConcreteHandle(recipient: string): boolean {
  const r = recipient.trim();
  // email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) return true;
  // Messages chat id (service-prefixed or bare chat<hex>)
  if (/^(iMessage|SMS);[+-];chat/i.test(r) || /^chat[0-9A-F-]{6,}$/i.test(r)) {
    return true;
  }
  // phone number: at least 7 digits, only phone-ish characters
  const digits = r.replace(/[^0-9]/g, "");
  if (digits.length >= 7 && /^[+()\-.\s0-9]+$/.test(r)) return true;
  return false;
}

/**
 * Query macOS Contacts for handles matching `name`. Returns a de-duplicated
 * list of phone numbers + emails for every person whose name matches, or a
 * discriminated failure when the Contacts permission is missing.
 *
 * Runs a JXA (JavaScript for Automation) script via `run_jxa` rather than
 * AppleScript: `tell application "Contacts"` returns -600 "Application isn't
 * running" when Contacts isn't open, but the JXA `people.whose({name:...})`
 * form launches Contacts in the background and resolves reliably. The script
 * matches the query against each person's full `name` case-insensitively
 * (`_contains`), then emits every phone `value` and email `value` for the
 * matched people, one handle per line.
 *
 * Injection safety: the name is embedded via JSON.stringify — a proper JS
 * string literal — so it is data, never code.
 *
 * A JXA permission denial raises an osascript error whose text differs from
 * AppleScript's: it mentions "Not authorized", a privacy phrase, "-1743", or
 * "doesn't have permission". We translate any of those into a typed permission
 * result so the caller can tell the user to grant access instead of guessing.
 */
async function queryContacts(
  name: string,
): Promise<{ ok: true; handles: string[] } | { ok: false; reason: "denied" | "error" }> {
  // JSON.stringify yields a safe double-quoted JS string literal for the name;
  // it is the ONLY interpolation, so the query text can never break out into
  // executable JXA code.
  const nameLiteral = JSON.stringify(name);
  const script = `
const Contacts = Application("Contacts");
const query = ${nameLiteral}.trim().toLowerCase();
function tokenKey(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\\s+/g, " ").trim();
}
const queryKey = tokenKey(query);
const matched = Contacts.people.whose({ name: { _contains: ${nameLiteral} } })()
  .filter((p) => {
    const n = String(p.name() || "").trim().toLowerCase();
    const key = tokenKey(n);
    return key === queryKey || key.startsWith(queryKey + " ") || (" " + key + " ").indexOf(" " + queryKey + " ") !== -1;
  });
const out = [];
for (const p of matched) {
  const phones = p.phones();
  for (const ph of phones) {
    const v = ph.value();
    if (v) out.push(v);
  }
  const emails = p.emails();
  for (const em of emails) {
    const v = em.value();
    if (v) out.push(v);
  }
}
out.join("\\n");
`.trim();

  try {
    const raw = await runJxa(script, `contacts-resolve:${name}`, 8_000);
    const handles = raw
      .split(/\r?\n/)
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
    return { ok: true, handles };
  } catch (err) {
    const msg = String((err as { message?: string })?.message ?? err ?? "");
    // JXA TCC denial signatures: osascript surfaces the Contacts privacy error
    // as "Not authorized to send Apple events" / "doesn't have permission" /
    // error number -1743, or an explicit privacy phrase. Treat any of these as
    // "denied" so the user is told to grant access rather than us guessing.
    if (
      /not authorized/i.test(msg) ||
      /-?1743/.test(msg) ||
      /permission/i.test(msg) ||
      /privacy/i.test(msg)
    ) {
      // eslint-disable-next-line no-console
      console.warn(`[imessage-resolve] Contacts access denied for "${name}": ${msg}`);
      return { ok: false, reason: "denied" };
    }
    // eslint-disable-next-line no-console
    console.warn(`[imessage-resolve] Contacts query for "${name}" failed: ${msg}`);
    return { ok: false, reason: "error" };
  }
}

/** Normalize a handle for comparison (strip formatting from phone numbers so
 *  "+1 (415) 555-1212" and "+14155551212" compare equal; lower-case emails). */
function normalizeHandle(handle: string): string {
  const h = handle.trim();
  if (h.includes("@")) return h.toLowerCase();
  const digits = h.replace(/[^0-9]/g, "");
  // Keep the last 10 digits so a US number with/without country code matches.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Resolve a send_message recipient to a concrete iMessage handle.
 *
 * - Already a phone/email/chat-id → `passthrough` (no lookup, no regression on
 *   the common already-a-number path).
 * - A NAME → macOS Contacts first; disambiguate/fall back with recent iMessage
 *   threads. Exactly one confident handle → `resolved`. Otherwise `ambiguous`
 *   / `not_found` / `no_contacts_permission` so the caller ABORTS the send and
 *   speaks an honest line — never a blind send to a guessed handle.
 */
export async function resolveImessageRecipient(
  recipient: string,
): Promise<RecipientResolution> {
  const name = recipient.trim();
  if (isConcreteHandle(name)) {
    return { kind: "passthrough", handle: name };
  }

  // Recent-threads candidates: raw handles the user has actually messaged whose
  // resolved senderName matches the name. Used both to disambiguate multiple
  // Contacts matches and as a standalone fallback when Contacts is unavailable.
  const recentHandles = await resolveRecentImessageHandles(name);
  const recentSet = new Set(recentHandles.map(normalizeHandle));

  const contacts = await queryContacts(name);

  if (contacts.ok) {
    const handles = contacts.handles;
    if (handles.length === 0) {
      // Contacts had no match. Fall back to recent threads if we messaged this
      // person before (single distinct handle only — never guess among many).
      return fromRecentOnly(name, recentHandles);
    }
    // De-duplicate Contacts handles by normalized form.
    const byNorm = new Map<string, string>();
    for (const h of handles) {
      const norm = normalizeHandle(h);
      if (!byNorm.has(norm)) byNorm.set(norm, h);
    }
    const contactHandles = [...byNorm.values()];
    if (contactHandles.length === 1) {
      return { kind: "resolved", handle: contactHandles[0]! };
    }
    // Multiple Contacts handles. Prefer the one the user has recently messaged.
    const overlap = [...byNorm.entries()].filter(([norm]) => recentSet.has(norm));
    if (overlap.length === 1) {
      return { kind: "resolved", handle: overlap[0]![1] };
    }
    // Still ambiguous — do NOT guess. Surface the candidate handles.
    return { kind: "ambiguous", name, candidates: contactHandles };
  }

  // Contacts unavailable (permission denied or query error). Try recent threads
  // as the resolution source (the memory note explicitly permits this fallback).
  if (recentHandles.length > 0) {
    return fromRecentOnly(name, recentHandles);
  }
  // No Contacts access AND nothing in recent threads: if it was specifically a
  // permission denial, tell the user to grant access; otherwise not_found.
  if (contacts.reason === "denied") {
    return { kind: "no_contacts_permission", name };
  }
  return { kind: "not_found", name };
}

/** Resolve using ONLY recent-thread handles. Exactly one distinct handle →
 *  resolved; several distinct → ambiguous; none → not_found. */
function fromRecentOnly(name: string, recentHandles: string[]): RecipientResolution {
  const byNorm = new Map<string, string>();
  for (const h of recentHandles) {
    const norm = normalizeHandle(h);
    if (norm.length > 0 && !byNorm.has(norm)) byNorm.set(norm, h);
  }
  const distinct = [...byNorm.values()];
  if (distinct.length === 0) return { kind: "not_found", name };
  if (distinct.length === 1) return { kind: "resolved", handle: distinct[0]! };
  return { kind: "ambiguous", name, candidates: distinct };
}
