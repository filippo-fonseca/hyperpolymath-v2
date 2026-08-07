/**
 * The app's one emoji source.
 *
 * Pages, projects, and areas each used to ship their own "type an emoji" text
 * field, which meant three different affordances for the same act and no way
 * to browse or search. They all now render `EmojiPicker`, and this module is
 * what stands behind it.
 *
 * The dataset is `@emoji-mart/data` (native set, ~1MB of JSON with per-emoji
 * keywords), loaded through a DYNAMIC import the first time a picker opens and
 * memoized for the session. That keeps a megabyte of emoji names out of every
 * page's initial bundle: no surface pays for the picker until someone actually
 * reaches for it.
 */

export type EmojiCategoryId =
  | "frequent"
  | "people"
  | "nature"
  | "foods"
  | "activity"
  | "places"
  | "objects"
  | "symbols"
  | "flags";

export type EmojiEntry = {
  /** The rendered character, e.g. "🍋". */
  native: string;
  /** Human name, e.g. "Lemon". Used as the tooltip and as search text. */
  name: string;
  /** Lowercased search terms: the id, the name's words, and the keywords. */
  terms: string[];
};

export type EmojiCategory = {
  id: EmojiCategoryId;
  label: string;
  emojis: EmojiEntry[];
};

export const CATEGORY_LABELS: Record<EmojiCategoryId, string> = {
  frequent: "Frequent",
  people: "Smileys & people",
  nature: "Animals & nature",
  foods: "Food & drink",
  activity: "Activity",
  places: "Travel & places",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
};

type RawData = {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<
    string,
    {
      id: string;
      name: string;
      keywords?: string[];
      skins: { native: string }[];
    }
  >;
};

let cache: EmojiCategory[] | null = null;
let inFlight: Promise<EmojiCategory[]> | null = null;

/**
 * Load (once) and normalize the dataset into the shape the picker renders.
 * Concurrent callers share a single import — two pickers mounting in the same
 * tick must not each pull the JSON.
 */
export async function loadEmojiCategories(): Promise<EmojiCategory[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const mod = await import("@emoji-mart/data");
    const data = ((mod as { default?: RawData }).default ?? mod) as unknown as RawData;

    const out: EmojiCategory[] = [];
    for (const cat of data.categories) {
      const id = cat.id as EmojiCategoryId;
      if (!(id in CATEGORY_LABELS)) continue;

      const emojis: EmojiEntry[] = [];
      for (const emojiId of cat.emojis) {
        const raw = data.emojis[emojiId];
        const native = raw?.skins?.[0]?.native;
        if (!raw || !native) continue;
        emojis.push({
          native,
          name: raw.name,
          terms: Array.from(
            new Set([
              raw.id.toLowerCase(),
              ...raw.name.toLowerCase().split(/\s+/),
              ...(raw.keywords ?? []).map((k) => k.toLowerCase()),
            ])
          ),
        });
      }
      if (emojis.length > 0) out.push({ id, label: CATEGORY_LABELS[id], emojis });
    }

    cache = out;
    inFlight = null;
    return out;
  })();

  return inFlight;
}

/**
 * Prefix match on any term, so "lem" finds 🍋 and "roc" finds 🚀. Prefix rather
 * than substring: substring matching on a keyword list this dense turns short
 * queries into noise ("an" would hit several hundred emoji).
 */
export function searchEmoji(categories: EmojiCategory[], query: string, limit = 90): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact: EmojiEntry[] = [];
  const partial: EmojiEntry[] = [];
  for (const cat of categories) {
    for (const e of cat.emojis) {
      if (e.terms.some((t) => t === q)) exact.push(e);
      else if (e.terms.some((t) => t.startsWith(q))) partial.push(e);
      if (exact.length >= limit) return exact.slice(0, limit);
    }
  }
  return [...exact, ...partial].slice(0, limit);
}

/**
 * A pleasant random emoji for a thing that has none yet.
 *
 * Drawn from a hand-picked pool rather than the full set, because "random" out
 * of four thousand lands on a bandaged face or a regional flag more often than
 * on anything you would want at the top of a page. These all read as neutral,
 * cheerful objects.
 */
const RANDOM_POOL = [
  "🌱",
  "🌿",
  "🍀",
  "🌾",
  "🌻",
  "🌸",
  "🌊",
  "🔥",
  "⭐",
  "✨",
  "🌙",
  "☀️",
  "🪐",
  "🚀",
  "🛰️",
  "🧭",
  "🗺️",
  "⛰️",
  "🏔️",
  "🌋",
  "📌",
  "📎",
  "📐",
  "📚",
  "📖",
  "📝",
  "🖋️",
  "🗂️",
  "🧩",
  "🔭",
  "🔬",
  "⚗️",
  "🧪",
  "💡",
  "🔑",
  "🎯",
  "🎲",
  "🎨",
  "🎼",
  "🎧",
  "🍋",
  "🍊",
  "🍐",
  "🍇",
  "🍄",
  "☕",
  "🍵",
  "🧊",
  "🐢",
  "🦊",
  "🦉",
  "🐝",
  "🦋",
  "🐙",
  "🐳",
  "🦕",
  "🕰️",
  "⚓",
  "🪁",
  "🧶",
];

/** Uniform pick from the pool, optionally avoiding the current value. */
export function randomEmoji(exclude?: string | null): string {
  const pool = exclude ? RANDOM_POOL.filter((e) => e !== exclude) : RANDOM_POOL;
  return pool[Math.floor(Math.random() * pool.length)] ?? "🌱";
}
