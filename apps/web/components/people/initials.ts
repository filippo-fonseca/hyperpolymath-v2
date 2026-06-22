/** Up to two uppercase initials from a person's name; falls back to a dot. */
export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The canonical relationship tags surfaced as quick-add chips. */
export const CANONICAL_TAGS = [
  "friend",
  "investor",
  "teacher",
  "professor",
  "code",
  "colleague",
  "mentor",
] as const;
