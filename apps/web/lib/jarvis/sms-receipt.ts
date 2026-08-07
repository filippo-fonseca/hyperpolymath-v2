/**
 * Natural-language action receipts for text channels.
 *
 * `formatReceiptSummary` (the in-document pill) produces "Created 1 task,
 * Created 2 events" — right for a chip under an editor, wrong for a text
 * message, where that reads like a log line rather than an answer.
 *
 * This formatter names the things instead of counting them: SMS is the one
 * channel with no screen behind it, so "Added 'Call the lab' to your tasks" is
 * the difference between a confirmation and a receipt you have to go check.
 *
 * It reads the SAME `receipt` payloads the executor already returns (see
 * `lib/jarvis/executor.ts` — every create/update/delete carries
 * `receipt.title` or `receipt.content`), so nothing new has to be threaded
 * through the turn to make this work.
 */

/** The minimal action shape this formatter needs. */
export interface SmsReceiptAction {
  /** Tool name, e.g. "create_task". */
  name: string;
  /** The executor's return value. Shape is checked defensively. */
  result?: unknown;
}

type Parsed = {
  ok?: boolean;
  receipt?: { title?: string; content?: string; deleted?: boolean };
};

/**
 * Pull the `{ ok, receipt }` envelope off an executor result.
 *
 * Accepts an object (the in-process path) or a JSON string (the persisted
 * path), because the same actions are replayed from `jarvis_turns.actions`
 * where they have been through JSON. Anything unrecognized yields `{}` rather
 * than throwing: a receipt is a courtesy, and a malformed one must never cost
 * the user their reply.
 */
function parseResult(result: unknown): Parsed {
  if (!result) return {};
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as Parsed;
    } catch {
      return {};
    }
  }
  if (typeof result === "object") return result as Parsed;
  return {};
}

/** Tool name → the noun a human would use for the thing. */
const NOUNS: Record<string, string> = {
  task: "task",
  capture: "note",
  event: "event",
  page: "page",
  project: "project",
  area: "area",
  habit: "habit",
  person: "person",
  reminder: "reminder",
};

/** Tool verb → how the receipt says it happened. */
const VERBS: Record<string, string> = {
  create: "Added",
  add: "Added",
  edit: "Updated",
  update: "Updated",
  complete: "Completed",
  delete: "Deleted",
  remove: "Deleted",
  move: "Moved",
  link: "Linked",
};

/** Split "create_task" into ("create", "task"). */
function splitTool(name: string): { verb: string; noun: string } {
  const i = name.indexOf("_");
  if (i === -1) return { verb: name, noun: "" };
  return { verb: name.slice(0, i), noun: name.slice(i + 1).replace(/_/g, " ") };
}

function pluralize(noun: string, n: number): string {
  if (n === 1) return noun;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

/**
 * Shorten a label for a text message. A capture can be a paragraph, and the
 * receipt is not the place to replay it.
 */
function short(label: string, max = 48): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** "a", "a and b", "a, b and c" — the Oxford-less list a person would say. */
function joinNatural(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type Group = { verb: string; noun: string; labels: string[]; count: number };

/**
 * One natural-language sentence describing everything a turn actually changed,
 * or null when it changed nothing (a question, a lookup, a refusal).
 *
 * Null rather than "No changes" on purpose: a turn that only answered a
 * question should send the answer and stop, not append a line telling the user
 * that answering was not a change.
 *
 * Examples:
 *   Added "Call the lab" to your tasks.
 *   Added 2 tasks: "Call the lab" and "Book a room".
 *   Added "Dentist" to your calendar and captured 1 note.
 *   Completed 3 tasks.
 */
export function formatSmsReceipt(actions: SmsReceiptAction[]): string | null {
  const groups = new Map<string, Group>();

  for (const action of actions) {
    const parsed = parseResult(action.result);
    // A tool that reported failure did not change anything; claiming otherwise
    // in a receipt is worse than staying quiet.
    if (parsed.ok === false) continue;

    const { verb, noun } = splitTool(action.name);
    const displayVerb = VERBS[verb];
    // Only report mutations. Reads (list_*, search_*, get_*) have no place in
    // a receipt, and an unmapped verb is far more likely to be a read than a
    // write we forgot.
    if (!displayVerb) continue;

    const displayNoun = NOUNS[noun] ?? noun;
    if (!displayNoun) continue;

    const key = `${displayVerb}:${displayNoun}`;
    const group = groups.get(key) ?? { verb: displayVerb, noun: displayNoun, labels: [], count: 0 };
    group.count += 1;

    const label = parsed.receipt?.title ?? parsed.receipt?.content;
    if (label?.trim()) group.labels.push(short(label));
    groups.set(key, group);
  }

  if (groups.size === 0) return null;

  const clauses: string[] = [];
  for (const g of groups.values()) {
    // Name them when we can and the list stays readable in a text; past three
    // the names stop helping and the count is the useful fact.
    const named = g.labels.length === g.count && g.count <= 3;
    if (named) {
      const quoted = g.labels.map((l) => `“${l}”`);
      clauses.push(
        g.count === 1
          ? `${g.verb.toLowerCase()} ${quoted[0]} to your ${pluralize(g.noun, 2)}`
          : `${g.verb.toLowerCase()} ${g.count} ${pluralize(g.noun, g.count)}: ${joinNatural(quoted)}`
      );
    } else {
      clauses.push(`${g.verb.toLowerCase()} ${g.count} ${pluralize(g.noun, g.count)}`);
    }
  }

  const sentence = joinNatural(clauses);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/**
 * The message body for a finished turn: what JARVIS said, plus what it did.
 *
 * The two used to be an either/or (`prose || receipt`), which meant any turn
 * that produced a sentence silently dropped its receipt — "Loud and clear,
 * sir." with no mention of the task it had just filed. On a channel with no UI
 * to fall back on, the receipt is the part that matters most, so it is
 * appended whenever the turn changed something and the prose has not already
 * said so.
 */
export function composeSmsReply(prose: string, actions: SmsReceiptAction[]): string {
  const receipt = formatSmsReceipt(actions);
  const text = prose.trim();

  if (!receipt) return text || "Done, sir.";
  if (!text) return receipt;

  // Do not say it twice. When the prose already names every changed thing, the
  // receipt is noise; the check is on the labels rather than on the phrasing,
  // since the model words it differently every time.
  const lower = text.toLowerCase();
  const labels = actions
    .map((a) => {
      const r = parseResult(a.result).receipt;
      return (r?.title ?? r?.content ?? "").trim().toLowerCase();
    })
    .filter(Boolean);
  const allNamed =
    labels.length > 0 && labels.every((l) => lower.includes(short(l, 24).toLowerCase()));
  if (allNamed) return text;

  return `${text}\n\n${receipt}`;
}
