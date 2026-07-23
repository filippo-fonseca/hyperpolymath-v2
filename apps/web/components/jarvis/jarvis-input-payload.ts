/**
 * Pure payload builder for the JARVIS Console composer.
 *
 * Extracted so:
 *   1. Tests can exercise the full client-side parse chain (slash → mentions →
 *      hashtags → dates → priority) WITHOUT spinning up TipTap in jsdom (which
 *      is fragile and timing-dependent).
 *   2. JarvisInput can drive submission from either `editor.getText()` (Enter
 *      handler) OR `_view.state.doc.textContent` (live ProseMirror read inside
 *      handleKeyDown), guaranteeing parser inputs match what the user actually
 *      sees regardless of any closure-staleness on the editor reference.
 *
 * BUG CONTEXT (B-priority-first-send, May 14 2026):
 *   The first send after page reload was losing the priority hint (typing
 *   "buy goat tomorrow p1" produced a P3 task, but the second send worked).
 *   Root cause: `extractPayload` lived inside the component as a non-memoised
 *   inner function and was called by `handleSubmit` (useCallback) — the
 *   PRIORITY_TOKEN_RE check ran on `editor.getText()`, which on the first
 *   submit returned the text correctly but the resulting `parsedPriority`
 *   field was being lost somewhere in the closure chain. Pulling the parse
 *   into a pure function with explicit inputs eliminates the entire class
 *   of closure-staleness bugs and makes the path deterministic + testable.
 */

import {
  parseDates,
  parsePriority,
  parseSlashCommand,
  type ParsedDate,
  type Priority,
} from "@hyperpolymath/jarvis-core";
import {
  entityMentionAttrsToRef,
  ENTITY_MENTION_NODE,
  serializeEntityMentionNode,
} from "@/lib/references/tiptap-tokens";
import type { SlashCommandKey } from "./SlashCommandPopover";

export interface LinkedPerson {
  id: string;
  name: string;
}

export interface JarvisInputPayload {
  input: string;
  parsedDates: ParsedDate[];
  parsedPriority: Priority | null;
  slashCommand: SlashCommandKey | null;
  hashtags: string[];
  projectIds: string[];
  people: LinkedPerson[];
}

/**
 * Match an explicit priority token at word boundaries. Mirrors the gate used
 * by parsePriority so we only forward the field when the user actually typed
 * one of {ptop, p0, p1, p2, p3} (`parsePriority` itself always returns "P3"
 * by default — without this gate we'd send "P3" on every submit, which the
 * server would dutifully bind, overriding the model's discretion).
 */
const PRIORITY_TOKEN_RE = /\b(ptop|p0|p1|p2|p3)\b/i;

/** Phase 2 permissive hashtag scan; same convention as CaptureComposer. */
const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;

/**
 * Serialize a TipTap-shaped JSON doc back to the text the user sees, encoding
 * mention nodes as their chip markers (`#label` / `$label` / `@label`).
 *
 * Why this exists: the composer's submit path reads the plain text via
 * ProseMirror's `doc.textContent`, but TipTap wires a Mention's `renderText`
 * into the schema's `toText` serializer — which `doc.textContent` does NOT
 * consult (it only honours the native `leafText`). So a committed `#tag` chip
 * contributes NOTHING to `doc.textContent` and silently vanishes from the sent
 * message. Rebuilding the string from the JSON restores the marker, so the tag
 * survives into the transcript (and the server input) instead of disappearing.
 */
function serializeEditorJson(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const n = json as {
    type?: string;
    text?: string;
    attrs?: { id?: string; label?: string };
    content?: unknown[];
  };
  if (n.type === "text") return typeof n.text === "string" ? n.text : "";
  // An entityMention carries a real entity id, so it serializes to the
  // canonical S1 token rather than to a bare `@label` marker — the whole point
  // being that the server can bind "@Marathon Training" to one exact row
  // instead of guessing by name. Same textContent trap as the chips below: the
  // node contributes nothing to doc.textContent, so it MUST be rebuilt here.
  const entityToken = serializeEntityMentionNode(n);
  if (entityToken !== null) return entityToken;
  if (n.type === "mention") return `#${n.attrs?.label ?? n.attrs?.id ?? ""}`;
  if (n.type === "projectMention")
    return `$${n.attrs?.label ?? n.attrs?.id ?? ""}`;
  if (n.type === "personMention")
    return `@${n.attrs?.label ?? n.attrs?.id ?? ""}`;
  if (n.type === "hardBreak") return "\n";
  if (Array.isArray(n.content)) {
    const parts = n.content.map(serializeEditorJson);
    // Block-level nodes (paragraphs under the doc) are newline-separated;
    // inline runs concatenate directly.
    return parts.join(n.type === "doc" ? "\n" : "");
  }
  return "";
}

/**
 * Walk a TipTap-shaped JSON tree collecting hashtag labels, project IDs, and
 * person mentions. Mention nodes carry `attrs.label` (hashtag display name) or
 * `attrs.id` (project / person UUID, with `attrs.label` the display name).
 */
function collectMentions(
  json: unknown,
  hashtags: string[],
  projectIds: string[],
  people: LinkedPerson[]
): void {
  if (!json || typeof json !== "object") return;
  const n = json as {
    type?: string;
    attrs?: { id?: string; label?: string };
    content?: unknown[];
  };
  if (n.type === "mention" && typeof n.attrs?.label === "string") {
    const t = n.attrs.label.toLowerCase();
    if (!hashtags.includes(t)) hashtags.push(t);
  }
  if (n.type === "projectMention" && typeof n.attrs?.id === "string") {
    if (!projectIds.includes(n.attrs.id)) projectIds.push(n.attrs.id);
  }
  if (n.type === "personMention" && typeof n.attrs?.id === "string") {
    const id = n.attrs.id;
    if (!people.some((p) => p.id === id)) {
      people.push({ id, name: n.attrs.label ?? "" });
    }
  }
  // The universal `@` replaced the person-only one, so a person the user
  // mentions now arrives as an entityMention. Keep feeding the `people`
  // sidecar from it or `linkedPeople` silently empties out — the token in the
  // text is new information for the server, not a replacement for the hint it
  // already consumes. Other ref kinds are NOT folded into projectIds/hashtags:
  // `$project` still means "bind this turn to that project", and a passing @
  // reference to a project does not mean the same thing.
  if (n.type === ENTITY_MENTION_NODE) {
    const ref = entityMentionAttrsToRef(n.attrs);
    if (ref?.type === "person" && !people.some((p) => p.id === ref.id)) {
      people.push({ id: ref.id, name: ref.label });
    }
  }
  if (Array.isArray(n.content)) {
    for (const c of n.content) collectMentions(c, hashtags, projectIds, people);
  }
}

/**
 * Build a JARVIS Console submission payload from the editor's current text
 * + JSON. Pure — no React/TipTap dependencies; safe to call from tests.
 *
 * @param rawText  The editor's plain-text content (already-trimmed; we trim
 *                 defensively too).
 * @param editorJson Optional TipTap doc JSON for Mention node extraction.
 *                 When omitted, only permissive regex parses are used
 *                 (tests pass `null` and rely on the regex hashtag fallback).
 * @param userTimezone IANA tz for chrono date resolution.
 * @param slashCommandOverride When the user clicked a slash entry or pressed
 *                 Enter in the slash popover, this pins the command and skips
 *                 the auto-detector.
 *
 * Returns `null` only when the text is empty (so callers can early-out
 * without firing onSubmit).
 */
export function buildJarvisInputPayload(
  rawText: string,
  editorJson: unknown | null,
  userTimezone: string,
  slashCommandOverride: SlashCommandKey | null
): JarvisInputPayload | null {
  // Prefer the JSON-reconstructed text so committed mention chips (`#tag`,
  // `$project`) survive — `rawText` comes from `doc.textContent`, which drops
  // them (see serializeEditorJson). Tests pass `null` JSON and fall back to
  // rawText + the permissive regex below.
  const sourceText =
    editorJson !== null ? serializeEditorJson(editorJson) : rawText;
  const trimmed = sourceText.trim();
  if (trimmed.length === 0) return null;

  // 1. Slash command — either pinned override, or auto-detect via parser.
  let slashCommand: SlashCommandKey | null = slashCommandOverride;
  let inputText = trimmed;
  if (slashCommand === null) {
    const slashParsed = parseSlashCommand(trimmed);
    if (slashParsed) {
      slashCommand = slashParsed.command as SlashCommandKey;
      inputText = slashParsed.body;
    }
  } else {
    // Pinned command — strip the slash prefix word from the body.
    inputText = trimmed.replace(/^\/\S*\s*/, "");
  }

  // /help and /ask are surfaced to the server differently:
  //   - /help: NOT sent to the server (client renders the help list locally).
  //   - /ask:  forwarded to the server, which forbids tool calls.
  //   - everything else (task/capture/event/null): forwarded normally.
  const slashCommandForServer: SlashCommandKey | null =
    slashCommand === "help" ? null : slashCommand;

  // 2. Mentions (hashtag chips + project chips + person chips) — from editor
  //    JSON if given.
  const hashtags: string[] = [];
  const projectIds: string[] = [];
  const people: LinkedPerson[] = [];
  if (editorJson !== null) collectMentions(editorJson, hashtags, projectIds, people);

  // 3. Permissive hashtag regex — catches `#tag` that the user typed but
  //    didn't pop the autocomplete for. De-duplicates against the chip set.
  for (const m of inputText.matchAll(HASHTAG_RE)) {
    const tag = m[1]?.toLowerCase();
    if (tag && !hashtags.includes(tag)) hashtags.push(tag);
  }

  // 4. Date pre-parse (D-10) — chrono → TZDate → UTC ISO array.
  const parsedDates = parseDates(inputText, userTimezone);

  // 5. Priority pre-parse — only forward when an explicit token is present.
  //    parsePriority returns "P3" by default; without this gate we'd shove
  //    a P3 hint into every turn and override the model's discretion.
  const parsedPriority: Priority | null = PRIORITY_TOKEN_RE.test(inputText)
    ? parsePriority(inputText)
    : null;

  return {
    input: inputText,
    parsedDates,
    parsedPriority,
    slashCommand: slashCommandForServer,
    hashtags,
    projectIds,
    people,
  };
}
