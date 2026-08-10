// Canonical query keys. Every read and every invalidation goes through
// these builders so keys can never drift between hooks, realtime, and the
// SSE tool-call handler.

export const queryKeys = {
  tasks: ["tasks"] as const,
  habits: (start: string, end: string) => ["habits", start, end] as const,
  habitsAll: ["habits"] as const,
  captures: ["captures"] as const,
  projects: ["projects"] as const,
  calendar: ["calendar"] as const,
  wikiTree: ["wiki", "tree"] as const,
  wikiPage: (id: string) => ["wiki", "page", id] as const,
  wikiDaily: (date: string) => ["wiki", "daily", date] as const,
  wikiAll: ["wiki"] as const,
};
