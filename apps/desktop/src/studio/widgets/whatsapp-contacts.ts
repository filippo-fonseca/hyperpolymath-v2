// apps/desktop/src/studio/widgets/whatsapp-contacts.ts
// Resolve WhatsApp chat display names from the user's macOS Contacts.
//
// WHY: the synced `senderName` / `chatName` are the WhatsApp *push name* — what
// the CONTACT set for themselves. The user wants the name HE saved in his macOS
// address book (e.g. "Mamma" instead of the contact's own "Maria R."). The
// send path already resolves name→handle via Contacts JXA (see
// actions/imessage-contacts.ts); this is the REVERSE: a chat's phone number
// (derived from its jid) → the macOS Contacts display name.
//
// Non-blocking by construction: the chat list / conversation header render
// immediately with the best name they already have (synced push name > pretty
// number); Contacts lookups run asynchronously and the rows update as results
// land. Lookups are cached in a persisted jid→{name, checkedAt} map so the list
// never shells out to `osascript` per render, and re-checked ~daily.

import { load, type Store } from "@tauri-apps/plugin-store";

import { runJxa } from "@/actions/applescript";

const CACHE_FILE = "whatsapp-contacts.json";
const CACHE_KEY = "byJid";
/** Re-check a cached lookup at most once per this interval (~1 day). */
export const CONTACTS_RECHECK_MS = 24 * 60 * 60 * 1_000;

/** A cached Contacts resolution for one chat jid. `name` is null when Contacts
 *  had no match (a negative result is cached too, so a numberless chat isn't
 *  re-queried every render — only re-checked after CONTACTS_RECHECK_MS). */
export interface ContactCacheEntry {
  name: string | null;
  checkedAt: number;
}

export type ContactCache = Record<string, ContactCacheEntry>;

/** Extract the phone number (digits, no `+`) from an individual chat jid.
 *  `12036068566@s.whatsapp.net` → `12036068566`. Group jids (`@g.us`) and
 *  non-phone jids (`@lid`) return null — they have no address-book number. */
export function phoneFromJid(jid: string): string | null {
  const local = (jid.split("@")[0] ?? "").trim();
  if (!local) return null;
  // Group chats and linked-device (`@lid`) jids carry no dialable number.
  if (jid.endsWith("@g.us") || jid.endsWith("@lid")) return null;
  const digits = local.replace(/\D/g, "");
  // A real phone number is at least ~7 digits; anything shorter is not a number.
  return digits.length >= 7 ? digits : null;
}

/** Normalize a phone number to its comparable tail: strip all non-digits, then
 *  keep the last 10 digits (Contacts stores numbers with wildly varying
 *  formatting and country-code presence, so matching on the last 10/11 digits
 *  is the robust cross-format key). Numbers shorter than 10 digits keep their
 *  full digit string. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Two phone numbers refer to the same line when their normalized tails match.
 *  Also accepts an 11-digit US "1"-prefixed number against a 10-digit one. */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Guard the length-difference case (e.g. a bare 10-digit vs a "1" + 10).
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return longer.endsWith(shorter) && longer.length - shorter.length <= 1;
}

/** Choose the name to display for a chat, in priority order:
 *   1. macOS Contacts name (what the user saved),
 *   2. synced WhatsApp name (push/full name, non-empty and not a raw jid),
 *   3. the already-prettified fallback the route computed (pretty number, or a
 *      group subject / "Group chat").
 *  `syncedName` here is whatever the route resolved (it may itself already be a
 *  pretty number for numberless chats); it's only preferred over the fallback
 *  when it looks like a real human name, not a phone-number string. */
export function pickContactName(
  contactsName: string | null | undefined,
  syncedName: string | null | undefined,
  fallback: string,
): string {
  const c = contactsName?.trim();
  if (c) return c;
  const s = syncedName?.trim();
  // Prefer the synced name only when it's an actual name — not a bare
  // number/jid that the route already folded into `fallback`.
  if (s && s !== fallback && !s.includes("@") && /[a-z]/i.test(s)) return s;
  return fallback;
}

let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load(CACHE_FILE, { autoSave: true, defaults: { [CACHE_KEY]: {} } });
  }
  return _store;
}

/** Read the persisted jid→entry cache (empty object if unset/unavailable). */
export async function loadContactCache(): Promise<ContactCache> {
  try {
    const store = await getStore();
    const raw = await store.get<ContactCache>(CACHE_KEY);
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** Whether a cache entry is fresh enough to serve without re-querying. */
export function isCacheEntryFresh(entry: ContactCacheEntry, now = Date.now()): boolean {
  return now - entry.checkedAt < CONTACTS_RECHECK_MS;
}

async function writeCacheEntry(jid: string, entry: ContactCacheEntry): Promise<void> {
  try {
    const store = await getStore();
    const current = (await store.get<ContactCache>(CACHE_KEY)) ?? {};
    current[jid] = entry;
    await store.set(CACHE_KEY, current);
  } catch {
    // A cache-write failure is non-fatal — the name still resolved for this
    // render; it just won't be memoized. Swallow rather than break the widget.
  }
}

/** Query macOS Contacts for the display name of the person whose phone number
 *  matches `phone`. Scans the address book, normalizing each stored number to
 *  its last-10-digit tail (Contacts formats numbers inconsistently), and returns
 *  the first matching person's `name`. Null when there's no match; null on any
 *  JXA error / permission denial (a missing Contacts name is never fatal — the
 *  widget falls back to the synced name / pretty number). */
export async function queryContactNameByPhone(phone: string): Promise<string | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  // `target` is pure digits (normalizePhone strips everything else), so
  // embedding it as a JS string literal cannot break out of the JXA source.
  const targetLiteral = JSON.stringify(target);
  const script = `
const Contacts = Application("Contacts");
const target = ${targetLiteral};
function tail(s) { const d = String(s || "").replace(/[^0-9]/g, ""); return d.length > 10 ? d.slice(-10) : d; }
const people = Contacts.people();
let out = "";
for (let i = 0; i < people.length; i++) {
  const p = people[i];
  let phones;
  try { phones = p.phones(); } catch (e) { phones = []; }
  let hit = false;
  for (const ph of phones) {
    const v = tail(ph.value());
    if (v && v === target) { hit = true; break; }
  }
  if (hit) {
    let nm = "";
    try { nm = p.name(); } catch (e) { nm = ""; }
    if (nm) { out = nm; break; }
  }
}
out;
`.trim();

  try {
    const raw = await runJxa(script, `whatsapp-contact:${target}`, 8_000);
    const name = raw.trim();
    return name.length > 0 ? name : null;
  } catch (err) {
    // Permission denial or any other JXA error: cache nothing here, just fall
    // back. (A denial is logged once for diagnosis; it doesn't block the list.)
    // eslint-disable-next-line no-console
    console.warn(
      `[whatsapp-contacts] Contacts lookup for a number failed: ${
        String((err as { message?: string })?.message ?? err ?? "")
      }`,
    );
    return null;
  }
}

/** Resolve a chat's macOS Contacts name, using the persisted cache when fresh
 *  and otherwise shelling out to JXA (then memoizing the result, including a
 *  negative one). Returns null for group / numberless chats and for no-match.
 *  Never throws — a lookup failure resolves to null. */
export async function resolveContactName(
  jid: string,
  now = Date.now(),
): Promise<string | null> {
  const phone = phoneFromJid(jid);
  if (!phone) return null;

  const cache = await loadContactCache();
  const cached = cache[jid];
  if (cached && isCacheEntryFresh(cached, now)) return cached.name;

  const name = await queryContactNameByPhone(phone);
  await writeCacheEntry(jid, { name, checkedAt: now });
  return name;
}
