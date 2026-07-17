import { stripReferences } from "@/lib/references/token";

export type PreviewBlock =
  | { kind: "heading"; text: string; level: 1 | 2 | 3 }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string; depth?: number }
  | { kind: "numbered"; text: string; depth?: number }
  | { kind: "todo"; text: string; checked: boolean }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string; language?: string }
  | { kind: "image"; url?: string; caption?: string }
  | { kind: "divider" }
  | { kind: "table-hint"; rows: number; cols: number };

export interface PreviewModel {
  blocks: PreviewBlock[];
  wordCount: number;
  isEmpty: boolean;
}

export interface ExtractPreviewOptions {
  maxBlocks?: number;
  maxChars?: number;
}

type UnknownRecord = Record<string, unknown>;
type ListContext = "bullet" | "numbered" | undefined;

const DEFAULT_MAX_BLOCKS = 12;
const DEFAULT_MAX_CHARS = 600;
const MAX_DEPTH = 2;

export function extractPreviewModel(
  contentJson: unknown,
  contentMarkdown?: string | null,
  opts: ExtractPreviewOptions = {}
): PreviewModel {
  try {
    const maxBlocks = Math.max(1, opts.maxBlocks ?? DEFAULT_MAX_BLOCKS);
    const maxChars = Math.max(1, opts.maxChars ?? DEFAULT_MAX_CHARS);
    const extraction = createExtraction();

    if (Array.isArray(contentJson) && contentJson.length > 0) {
      for (const block of contentJson) {
        collectJsonBlock(block, extraction, 0);
      }
    } else if (typeof contentMarkdown === "string" && contentMarkdown.trim()) {
      collectMarkdownBlocks(contentMarkdown, extraction);
    }

    const blocks = capBlocks(extraction.blocks, maxBlocks, maxChars);
    return {
      blocks,
      wordCount: extraction.wordCount,
      isEmpty: !blocks.some(isMeaningfulBlock),
    };
  } catch {
    return { blocks: [], wordCount: 0, isEmpty: true };
  }
}

function createExtraction() {
  return {
    blocks: [] as PreviewBlock[],
    wordCount: 0,
  };
}

function collectJsonBlock(
  input: unknown,
  extraction: ReturnType<typeof createExtraction>,
  depth: number,
  listContext?: ListContext
) {
  if (!isRecord(input)) return;

  const type = stringValue(input.type) ?? "paragraph";
  const props = isRecord(input.props) ? input.props : {};
  const content = input.content;
  const text = inlineText(content).trim();
  const nextDepth = Math.min(depth + 1, MAX_DEPTH);
  let childListContext: ListContext;

  switch (type) {
    case "heading":
      pushTextBlock(extraction, {
        kind: "heading",
        text,
        level: headingLevel(props.level),
      });
      break;
    case "bulletListItem":
      childListContext = "bullet";
      pushTextBlock(extraction, {
        kind: "bullet",
        text,
        depth: depthValue(depth),
      });
      break;
    case "numberedListItem":
      childListContext = "numbered";
      pushTextBlock(extraction, {
        kind: "numbered",
        text,
        depth: depthValue(depth),
      });
      break;
    case "checkListItem":
      pushTextBlock(extraction, {
        kind: "todo",
        text,
        checked: props.checked === true,
      });
      break;
    case "quote":
      pushTextBlock(extraction, { kind: "quote", text });
      break;
    case "codeBlock":
      pushTextBlock(extraction, {
        kind: "code",
        text,
        language: stringValue(props.language),
      });
      break;
    case "image":
      pushImageBlock(extraction, props);
      break;
    case "divider":
      extraction.blocks.push({ kind: "divider" });
      break;
    case "table":
      pushTableHint(extraction, content);
      break;
    case "paragraph":
      if (listContext === "bullet") {
        pushTextBlock(extraction, {
          kind: "bullet",
          text,
          depth: depthValue(depth),
        });
      } else if (listContext === "numbered") {
        pushTextBlock(extraction, {
          kind: "numbered",
          text,
          depth: depthValue(depth),
        });
      } else {
        pushTextBlock(extraction, { kind: "paragraph", text });
      }
      break;
    default:
      pushTextBlock(extraction, { kind: "paragraph", text });
      break;
  }

  if (Array.isArray(input.children)) {
    for (const child of input.children) {
      collectJsonBlock(child, extraction, nextDepth, childListContext);
    }
  }
}

function collectMarkdownBlocks(markdown: string, extraction: ReturnType<typeof createExtraction>) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let inFence = false;
  let fenceLanguage: string | undefined;
  let codeLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const fence = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);

    if (fence) {
      if (inFence) {
        pushTextBlock(extraction, {
          kind: "code",
          text: codeLines.join("\n").trim(),
          language: fenceLanguage,
        });
        codeLines = [];
        fenceLanguage = undefined;
        inFence = false;
      } else {
        inFence = true;
        fenceLanguage = fence[1];
      }
      continue;
    }

    if (inFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) continue;

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      extraction.blocks.push({ kind: "divider" });
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (image) {
      const caption = stripInlineMarkdown(image[1] ?? "").trim();
      const url = image[2]?.trim();
      if (caption) extraction.wordCount += countWords(caption);
      extraction.blocks.push({
        kind: "image",
        ...(url ? { url } : {}),
        ...(caption ? { caption } : {}),
      });
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      extraction.blocks.push({
        kind: "table-hint",
        rows: 1,
        cols: Math.max(1, trimmed.split("|").filter(Boolean).length),
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      pushTextBlock(extraction, {
        kind: "heading",
        text: stripInlineMarkdown(heading[2] ?? ""),
        level: headingLevel(heading[1]?.length),
      });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      pushTextBlock(extraction, {
        kind: "quote",
        text: stripInlineMarkdown(quote[1] ?? ""),
      });
      continue;
    }

    const todo = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (todo) {
      pushTextBlock(extraction, {
        kind: "todo",
        text: stripInlineMarkdown(todo[2] ?? ""),
        checked: todo[1]?.toLowerCase() === "x",
      });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      pushTextBlock(extraction, {
        kind: "bullet",
        text: stripInlineMarkdown(bullet[1] ?? ""),
      });
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      pushTextBlock(extraction, {
        kind: "numbered",
        text: stripInlineMarkdown(numbered[1] ?? ""),
      });
      continue;
    }

    pushTextBlock(extraction, {
      kind: "paragraph",
      text: stripInlineMarkdown(trimmed),
    });
  }

  if (inFence && codeLines.length > 0) {
    pushTextBlock(extraction, {
      kind: "code",
      text: codeLines.join("\n").trim(),
      language: fenceLanguage,
    });
  }
}

function pushTextBlock(
  extraction: ReturnType<typeof createExtraction>,
  block:
    | Extract<PreviewBlock, { kind: "heading" }>
    | Extract<PreviewBlock, { kind: "paragraph" }>
    | Extract<PreviewBlock, { kind: "bullet" }>
    | Extract<PreviewBlock, { kind: "numbered" }>
    | Extract<PreviewBlock, { kind: "todo" }>
    | Extract<PreviewBlock, { kind: "quote" }>
    | Extract<PreviewBlock, { kind: "code" }>
) {
  if (!block.text.trim()) return;
  extraction.wordCount += countWords(block.text);
  extraction.blocks.push(block);
}

function pushImageBlock(extraction: ReturnType<typeof createExtraction>, props: UnknownRecord) {
  const caption = firstString(props.caption, props.name);
  const url = stringValue(props.url);
  if (caption) extraction.wordCount += countWords(caption);
  extraction.blocks.push({
    kind: "image",
    ...(url ? { url } : {}),
    ...(caption ? { caption } : {}),
  });
}

function pushTableHint(extraction: ReturnType<typeof createExtraction>, content: unknown) {
  const rows = tableRows(content);
  if (rows.length === 0) {
    extraction.blocks.push({ kind: "table-hint", rows: 0, cols: 0 });
    return;
  }

  let cols = 0;
  for (const row of rows) {
    if (!isRecord(row) || !Array.isArray(row.cells)) continue;
    cols = Math.max(cols, row.cells.length);
    for (const cell of row.cells) {
      const text = inlineText(cell).trim();
      if (text) extraction.wordCount += countWords(text);
    }
  }
  extraction.blocks.push({ kind: "table-hint", rows: rows.length, cols });
}

function capBlocks(blocks: PreviewBlock[], maxBlocks: number, maxChars: number): PreviewBlock[] {
  const capped: PreviewBlock[] = [];
  let chars = 0;

  for (const block of blocks) {
    if (capped.length >= maxBlocks) break;

    const text = blockText(block);
    if (text.length === 0) {
      capped.push(block);
      continue;
    }

    const remaining = maxChars - chars;
    if (remaining <= 0) break;

    if (text.length > remaining) {
      capped.push(withBlockText(block, clipText(text, remaining)));
      break;
    }

    capped.push(block);
    chars += text.length;
  }

  return capped;
}

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];

  for (const item of content) {
    if (!isRecord(item)) continue;
    const type = stringValue(item.type);

    if (type === "text") {
      parts.push(stringValue(item.text) ?? "");
      continue;
    }

    if (type === "link") {
      parts.push(inlineText(item.content));
      continue;
    }

    const props = isRecord(item.props) ? item.props : {};
    if (type === "personMention") {
      parts.push(`@${firstString(props.name, "Someone")}`);
      continue;
    }

    if (type === "entityReference") {
      const label = firstString(props.label, "Untitled");
      const emoji = stringValue(props.emoji);
      parts.push(emoji ? `${emoji} ${label}` : label);
      continue;
    }

    if (type === "jarvisReceipt") {
      parts.push(firstString(props.summary, ""));
      continue;
    }

    parts.push(firstString(props.label, props.name, props.text, item.text, ""));
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function stripInlineMarkdown(value: string): string {
  return (
    stripReferences(value)
      // Reference tokens are stripped FIRST, and it has to be first: a token is
      // `@[label](ref://type/uuid)`, so the markdown-link rule below would
      // otherwise match the `[label](…)` half and leave the `@` stranded —
      // "@Marathon" instead of "Marathon" in every preview and thumbnail.
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/~~(.*?)~~/g, "$1")
      .trim()
  );
}

function countWords(value: string): number {
  const matches = value.trim().match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g);
  return matches?.length ?? 0;
}

function blockText(block: PreviewBlock): string {
  switch (block.kind) {
    case "divider":
    case "table-hint":
      return "";
    case "image":
      return block.caption ?? "";
    default:
      return block.text;
  }
}

function withBlockText(block: PreviewBlock, text: string): PreviewBlock {
  switch (block.kind) {
    case "heading":
      return { ...block, text };
    case "paragraph":
      return { ...block, text };
    case "bullet":
      return { ...block, text };
    case "numbered":
      return { ...block, text };
    case "todo":
      return { ...block, text };
    case "quote":
      return { ...block, text };
    case "code":
      return { ...block, text };
    case "image":
      return { ...block, caption: text };
    case "divider":
    case "table-hint":
      return block;
  }
}

function clipText(value: string, maxChars: number): string {
  if (maxChars <= 3) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 3).trimEnd()}...`;
}

function isMeaningfulBlock(block: PreviewBlock): boolean {
  switch (block.kind) {
    case "divider":
    case "table-hint":
      return true;
    case "image":
      return Boolean(block.url || block.caption);
    default:
      return Boolean(block.text.trim());
  }
}

function headingLevel(value: unknown): 1 | 2 | 3 {
  if (typeof value !== "number") return 1;
  if (value <= 1) return 1;
  if (value === 2) return 2;
  return 3;
}

function depthValue(depth: number): number | undefined {
  return depth > 0 ? Math.min(depth, MAX_DEPTH) : undefined;
}

function tableRows(content: unknown): unknown[] {
  if (!isRecord(content) || !Array.isArray(content.rows)) return [];
  return content.rows;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const str = stringValue(value);
    if (str) return str;
  }
  return "";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}
