/**
 * Minimal inline-markdown renderer for JARVIS prose.
 *
 * Supports:
 *   - `**bold**` → <strong>
 *   - `*italic*` and `_italic_` → <em>
 *   - `` `code` `` → <code>
 *   - `@[label](ref://type/uuid)` → an entity pill
 *
 * JARVIS prose is always 1–3 sentences, so a full markdown parser is
 * overkill. This tokenizer walks the string once, no regex, no deps.
 *
 * Block-level markdown (headings, lists, paragraphs) is NOT supported —
 * if the model ever emits any, it'll pass through as literal text and
 * we'll fix it then. The system prompt doesn't ask for blocks anyway.
 *
 * Streaming is the constraint that shapes the reference rule. This renderer
 * runs on a PARTIAL string every frame while JARVIS types, so a token arrives
 * one fragment at a time: `@[Mara`, then `@[Marathon](ref://pro`, and only
 * eventually the whole thing. Matching only complete tokens (parseReferences'
 * guarantee) means the half-formed prefixes render as the literal text they
 * currently are, and the pill appears in one step when the token closes. The
 * alternative — chipping on a prefix — would flicker a wrong chip on nearly
 * every frame.
 */

import type { ReactNode } from "react";
import { EntityPill } from "@/components/references/EntityPill";
import { type EntityRef, parseReferences } from "@/lib/references/token";

type Token =
  | { type: "text"; content: string }
  | { type: "em"; content: string }
  | { type: "strong"; content: string }
  | { type: "code"; content: string }
  | { type: "hashtag"; content: string }
  | { type: "project"; content: string }
  | { type: "person"; content: string }
  | { type: "entityRef"; ref: EntityRef };

/** Word char = the hashtag/project label alphabet (Unicode letters/digits/_). */
const isWordChar = (ch: string | undefined): boolean =>
  !!ch && /[\p{L}\p{N}_]/u.test(ch);
/** Project labels must start with a letter/underscore so "$5" stays a price. */
const isLabelStart = (ch: string | undefined): boolean =>
  !!ch && /[\p{L}_]/u.test(ch);

function hashtagChip(label: string, key: string | number): ReactNode {
  return (
    <span key={key} className="hashtag-chip-inline" data-hashtag={label}>
      #{label}
    </span>
  );
}

function projectChip(label: string, key: string | number): ReactNode {
  return (
    <span key={key} className="project-chip-inline" data-project={label}>
      {`$${label}`}
    </span>
  );
}

function personChip(name: string, key: string | number): ReactNode {
  return (
    <span key={key} className="person-chip-inline" data-person={name}>
      @{name}
    </span>
  );
}

/** How a string should be rendered. */
export interface InlineRenderOptions {
  /**
   * Known linked person names. Only these get `@`-pilled, longest-first.
   *
   * The same deliberate data dependency as tokenize-content.ts and
   * person-decorations.ts: without a list there is no way to tell a mention
   * from an email address or a handle, so an unknown `@run` must stay plain.
   * Omit it and `@name` renders literally — the previous behavior.
   */
  personNames?: string[];
}

/**
 * Walk a string once and split it into renderable tokens.
 *
 * `chipsOnly` is what a user's own message gets: chips, but no bold/italic/code.
 * A typed command is verbatim — the only rich affordance the user invoked is
 * the mention itself, so reformatting their words around it would be a liberty.
 *
 * Both modes share this one walk on purpose. They used to be two functions with
 * two copies of the chip rules, and they drifted: `@person` was implemented in
 * neither, `#`/`$` in both. One walk means a rule added here cannot land on one
 * bubble and miss the other.
 */
function tokenize(
  s: string,
  opts: InlineRenderOptions & { chipsOnly?: boolean } = {},
): Token[] {
  const { personNames, chipsOnly } = opts;

  // Longest-first so `@John Smith` wins over `@John` (same rule as
  // tokenize-content.ts — a person mention must resolve identically in a
  // capture body and in the transcript, or the same text reads two ways).
  const people = (personNames ?? [])
    .filter((n) => n.length > 0)
    .map((name) => ({ name, lower: name.toLowerCase() }))
    .sort((a, b) => b.name.length - a.name.length);

  // Complete reference tokens only. Mid-stream prefixes are absent from this
  // list and therefore render as the literal text they are so far.
  const refs = parseReferences(s);
  let nextRef = 0;

  const tokens: Token[] = [];
  let i = 0;
  let textBuf = "";
  const flush = () => {
    if (textBuf) {
      tokens.push({ type: "text", content: textBuf });
      textBuf = "";
    }
  };

  while (i < s.length) {
    const c = s[i];
    const c1 = s[i + 1];

    while (nextRef < refs.length && refs[nextRef].start < i) nextRef += 1;

    // A reference consumes its whole span, so a `#` or `*` inside a label is
    // label text, not a chip or emphasis. Note this rule is positional, not
    // absolute: a code span that OPENS earlier still swallows a token inside
    // it, which is what `` `@[x](ref://task/…)` `` should do.
    const ref = refs[nextRef];
    if (ref && i === ref.start) {
      flush();
      tokens.push({
        type: "entityRef",
        ref: { type: ref.type, id: ref.id, label: ref.label },
      });
      i = ref.end;
      nextRef += 1;
      continue;
    }

    // **bold** — match first so * inside doesn't trigger italic.
    if (!chipsOnly && c === "*" && c1 === "*") {
      const end = s.indexOf("**", i + 2);
      if (end > -1 && end > i + 2) {
        flush();
        tokens.push({ type: "strong", content: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // *italic* — single-asterisk, not part of a **bold** pair.
    if (!chipsOnly && c === "*" && c1 !== "*" && s[i - 1] !== "*") {
      const end = s.indexOf("*", i + 1);
      if (end > -1 && s[end + 1] !== "*" && end > i + 1) {
        flush();
        tokens.push({ type: "em", content: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // _italic_ — only when preceded by word boundary, to avoid mangling
    // snake_case_words or file_paths.
    if (!chipsOnly && c === "_" && (i === 0 || /[\s({[]/.test(s[i - 1] ?? ""))) {
      const end = s.indexOf("_", i + 1);
      if (
        end > -1 &&
        end > i + 1 &&
        (end === s.length - 1 || /[\s.,!?;:)\]}]/.test(s[end + 1] ?? ""))
      ) {
        flush();
        tokens.push({ type: "em", content: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // `inline code`
    if (!chipsOnly && c === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > -1 && end > i + 1) {
        flush();
        tokens.push({ type: "code", content: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // #hashtag chip — at a word boundary, ≥1 label char.
    if (c === "#" && !isWordChar(s[i - 1])) {
      let j = i + 1;
      while (isWordChar(s[j])) j++;
      if (j > i + 1) {
        flush();
        tokens.push({ type: "hashtag", content: s.slice(i + 1, j) });
        i = j;
        continue;
      }
    }

    // $project chip — at a word boundary, label starts with a letter/_.
    if (c === "$" && !isWordChar(s[i - 1]) && isLabelStart(s[i + 1])) {
      let j = i + 1;
      while (isWordChar(s[j])) j++;
      flush();
      tokens.push({ type: "project", content: s.slice(i + 1, j) });
      i = j;
      continue;
    }

    // @person chip — only against a known name. The composer sends a person
    // mention as a bare `@name` marker, and until now nothing here matched it,
    // so a chip the user picked came back as literal text in their own
    // transcript. Guarded exactly like tokenize-content.ts: word boundary
    // before, and the name must not run into a longer word after, so `@Jon`
    // never matches a person called "Jo".
    if (c === "@" && !isWordChar(s[i - 1]) && people.length > 0) {
      const rest = s.slice(i + 1);
      const restLower = rest.toLowerCase();
      const match = people.find(
        (p) =>
          restLower.startsWith(p.lower) && !isWordChar(rest[p.name.length]),
      );
      if (match) {
        flush();
        tokens.push({ type: "person", content: match.name });
        i += 1 + match.name.length;
        continue;
      }
    }

    textBuf += c;
    i++;
  }
  flush();
  return tokens;
}

/** Map one token to its node. Shared so both renderers agree on every chip. */
function renderToken(tok: Token, idx: number): ReactNode {
  switch (tok.type) {
    case "text":
      return tok.content;
    case "em":
      return <em key={idx}>{tok.content}</em>;
    case "strong":
      return <strong key={idx}>{tok.content}</strong>;
    case "code":
      return (
        <code
          key={idx}
          className="font-mono text-[0.9em] px-1 py-0.5 rounded-sm bg-[var(--surface-raised)]/60"
        >
          {tok.content}
        </code>
      );
    case "hashtag":
      return hashtagChip(tok.content, idx);
    case "project":
      return projectChip(tok.content, idx);
    case "person":
      return personChip(tok.content, idx);
    case "entityRef":
      return <EntityPill key={idx} entityRef={tok.ref} />;
  }
}

/**
 * Render a JARVIS prose string as React nodes with inline markdown applied.
 */
export function renderInlineMarkdown(
  text: string,
  opts: InlineRenderOptions = {},
): ReactNode[] {
  return tokenize(text, opts).map(renderToken);
}

/**
 * Render a raw USER message as React nodes, turning mention markers into
 * inline chips but leaving everything else literal.
 *
 * Unlike `renderInlineMarkdown`, this does NOT apply bold/italic/code — a
 * user's typed command is verbatim, and the only rich affordance they invoked
 * is the mention chip. This keeps the sent transcript visually consistent with
 * the composer (same `.hashtag-chip-inline` / `.project-chip-inline` tokens)
 * without reformatting the user's own words.
 */
export function renderUserText(
  text: string,
  opts: InlineRenderOptions = {},
): ReactNode[] {
  return tokenize(text, { ...opts, chipsOnly: true }).map(renderToken);
}
