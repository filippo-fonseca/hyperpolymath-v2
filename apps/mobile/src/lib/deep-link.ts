// App deep links opened from home-screen widgets (and elsewhere).
//
//   jarvis://today
//   jarvis://jarvis
//   jarvis://talk          → JARVIS tab + start dictation
//   jarvis://tasks/new
//   jarvis://captures/new
//   jarvis://pair?...      → handled separately by pair-link.ts

export type DeepLinkAction =
  | { kind: "today" }
  | { kind: "jarvis"; talk: boolean }
  | { kind: "new-task" }
  | { kind: "new-capture" };

export function parseDeepLink(url: string): DeepLinkAction | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "jarvis:" && parsed.protocol !== "exp:") return null;

  const host = (parsed.hostname || "").toLowerCase();
  const path = (parsed.pathname || "").replace(/^\/+/, "").toLowerCase();
  const segments = [host, ...path.split("/").filter(Boolean)].filter(Boolean);

  // Expo Go: exp://host/--/talk
  const expoIdx = segments.indexOf("--");
  const route = expoIdx >= 0 ? segments.slice(expoIdx + 1) : segments;

  const head = route[0];
  const next = route[1];

  if (head === "today") return { kind: "today" };
  if (head === "jarvis") return { kind: "jarvis", talk: false };
  if (head === "talk") return { kind: "jarvis", talk: true };
  if (head === "tasks" && next === "new") return { kind: "new-task" };
  if (head === "captures" && next === "new") return { kind: "new-capture" };
  if (head === "task" || head === "new-task") return { kind: "new-task" };
  if (head === "capture" || head === "new-capture") return { kind: "new-capture" };

  return null;
}
