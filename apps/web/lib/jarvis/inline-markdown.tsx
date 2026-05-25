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
  | { type: "code"; content: string };

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
    }
  });
}
