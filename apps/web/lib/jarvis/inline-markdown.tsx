/**
 * Minimal inline-markdown renderer for JARVIS prose.
 *
 * Supports:
 *   - `**bold**` → <strong>
 *   - `*italic*` and `_italic_` → <em>
 *   - `` `code` `` → <code>
 *
 * JARVIS prose is always 1–3 sentences, so a full markdown parser is
 * overkill. This tokenizer walks the string once, no regex, no deps.
 *
 * Block-level markdown (headings, lists, paragraphs) is NOT supported —
 * if the model ever emits any, it'll pass through as literal text and
 * we'll fix it then. The system prompt doesn't ask for blocks anyway.
 */

import type { ReactNode } from "react";

type Token =
  | { type: "text"; content: string }
  | { type: "em"; content: string }
  | { type: "strong"; content: string }
  | { type: "code"; content: string }
  | { type: "hashtag"; content: string }
  | { type: "project"; content: string };

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

function tokenize(s: string): Token[] {
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

    // **bold** — match first so * inside doesn't trigger italic.
    if (c === "*" && c1 === "*") {
      const end = s.indexOf("**", i + 2);
      if (end > -1 && end > i + 2) {
        flush();
        tokens.push({ type: "strong", content: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // *italic* — single-asterisk, not part of a **bold** pair.
    if (c === "*" && c1 !== "*" && s[i - 1] !== "*") {
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
    if (c === "_" && (i === 0 || /[\s({[]/.test(s[i - 1] ?? ""))) {
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
    if (c === "`") {
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

    textBuf += c;
    i++;
  }
  flush();
  return tokens;
}

/**
 * Render a JARVIS prose string as React nodes with inline markdown applied.
 */
export function renderInlineMarkdown(text: string): ReactNode[] {
  return tokenize(text).map((tok, idx) => {
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
    }
  });
}

/**
 * Render a raw USER message as React nodes, turning `#hashtag` / `$project`
 * markers into inline chips but leaving everything else literal.
 *
 * Unlike `renderInlineMarkdown`, this does NOT apply bold/italic/code — a
 * user's typed command is verbatim, and the only rich affordance they invoked
 * is the mention chip. This keeps the sent transcript visually consistent with
 * the composer (same `.hashtag-chip-inline` / `.project-chip-inline` tokens)
 * without reformatting the user's own words.
 */
export function renderUserText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let key = 0;
  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };

  while (i < text.length) {
    const c = text[i];

    if (c === "#" && !isWordChar(text[i - 1])) {
      let j = i + 1;
      while (isWordChar(text[j])) j++;
      if (j > i + 1) {
        flush();
        nodes.push(hashtagChip(text.slice(i + 1, j), `h${key++}`));
        i = j;
        continue;
      }
    }

    if (c === "$" && !isWordChar(text[i - 1]) && isLabelStart(text[i + 1])) {
      let j = i + 1;
      while (isWordChar(text[j])) j++;
      flush();
      nodes.push(projectChip(text.slice(i + 1, j), `p${key++}`));
      i = j;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return nodes;
}
