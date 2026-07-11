import { classifyMediaType, safeParseUrl, youtubeVideoId } from "@/lib/link-preview/classify";
import type { LinkPreviewMediaType } from "@/lib/link-preview/types";

export type LinkEmbedVariant = "bookmark" | "embed";

/** A paste is eligible only when the clipboard contains one bare HTTP(S) URL. */
export function pastedHttpUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const parsed = safeParseUrl(trimmed);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return null;
  return parsed.href;
}

export function isEmptyParagraph(block: {
  type?: string;
  content?: unknown;
}): boolean {
  return block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0;
}

export function classifyLinkEmbed(url: string): {
  mediaType: LinkPreviewMediaType;
  youtubeId: string | null;
} {
  return { mediaType: classifyMediaType(url), youtubeId: youtubeVideoId(url) };
}

export function linkDomain(url: string): string {
  const parsed = safeParseUrl(url);
  return parsed?.hostname.replace(/^www\./, "") ?? url;
}
