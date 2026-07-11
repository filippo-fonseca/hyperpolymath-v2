import { safeParseUrl } from "@/lib/link-preview/classify";

const BLOCKED_HOSTS = [
  "google.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
] as const;

export function normalizeBrowserUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = safeParseUrl(withScheme);
  return parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")
    ? parsed.href
    : null;
}

export function isKnownFrameBlocker(value: string): boolean {
  const host = safeParseUrl(value)?.hostname.replace(/^www\./, "").toLowerCase();
  if (!host) return false;
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

export function twitterStatusId(value: string): string | null {
  return safeParseUrl(value)?.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1] ?? null;
}
