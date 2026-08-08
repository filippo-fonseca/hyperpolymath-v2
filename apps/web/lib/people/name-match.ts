/**
 * name-match.ts — deterministic person resolution from free text.
 *
 * The smart matcher in `derive.ts` asks Haiku which existing people a note
 * refers to. That is the right tool for genuinely ambiguous prose, and it has
 * two hard limits: it needs a BYOK Anthropic key, and it is a model, so it can
 * miss the easy cases while burning a call on them.
 *
 * The easy cases are most of them. "asik" means Dr. Mehmet D. Asik because
 * exactly one person in the roster has "asik" among their name tokens; nothing
 * about that needs a language model, and it should not silently stop working
 * when a key is absent. This module is that pass: exact, token-level,
 * word-boundary matching against the roster, with ambiguity treated the same
 * way the model prompt treats it, which is to say left unresolved.
 *
 * The two passes union. The deterministic one catches names as written, the
 * model catches nicknames, possessives, and "my sister"; neither can remove
 * what the other found, and both feed the same additive link step.
 */

/**
 * Honorifics and post-nominals that identify no one. "Dr" must not match every
 * doctor in the roster, and a note saying "PhD" is not a reference to anybody.
 */
const NON_IDENTIFYING = new Set([
  "dr",
  "dr.",
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "prof",
  "professor",
  "sir",
  "dame",
  "lord",
  "lady",
  "rev",
  "fr",
  "st",
  "phd",
  "md",
  "dds",
  "dvm",
  "esq",
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
]);

/**
 * The shortest token worth matching on. Two characters lets "Jo" or "Li"
 * through, which are real names; one character is an initial ("Mehmet D.
 * Asik") and matching on it would link that person to every sentence
 * containing a stray letter.
 */
const MIN_TOKEN_LENGTH = 2;

/** Strip accents so "Asik" finds "Aşık" and "cesar" finds "César". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * The identifying tokens of a name: every word that is not an honorific, a
 * post-nominal, or a single initial. "Dr. Mehmet D. Asik" yields
 * ["mehmet", "asik"], so either the given name or the surname resolves him.
 */
export function nameTokens(name: string): string[] {
  return fold(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !NON_IDENTIFYING.has(t));
}

/** The full name, folded and space-normalized, for the whole-name pass. */
function fullNameKey(name: string): string {
  return nameTokens(name).join(" ");
}

export interface NameMatchPerson {
  id: string;
  name: string;
}

/**
 * Resolve people referenced by name in `text`.
 *
 * Two rungs, strongest first:
 *
 *   1. **Full name.** Every identifying token of a person's name appearing in
 *      order in the text ("mehmet asik", and also "Dr. Mehmet D. Asik" itself
 *      once folded) is unambiguous even when a token is shared: two Annas do
 *      not collide once you have said which Anna.
 *   2. **Single token.** A lone token ("asik", "anna") resolves only when
 *      EXACTLY ONE person in the roster owns it. Shared by two people, it is
 *      ambiguous and is dropped, which is the same call the model prompt makes
 *      and for the same reason: a wrong link is worse than a missing one.
 *
 * Matching is word-boundary and accent-folded, so "Anna" does not match
 * "Annabel" and "Asik" does match "Aşık". Order of the returned ids follows
 * the roster, so the result is stable for a given roster and text.
 */
export function matchPeopleByName(
  text: string,
  roster: readonly NameMatchPerson[],
): string[] {
  const haystack = fold(text);
  if (!haystack.trim() || roster.length === 0) return [];

  // Word-boundary set of the text's own tokens. Substring search would match
  // "asik" inside "basikal"; a token set cannot.
  const textTokens = new Set(
    haystack.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0),
  );
  const textKey = haystack.replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  // Which people own each single token, to decide ambiguity.
  const ownersByToken = new Map<string, string[]>();
  for (const person of roster) {
    for (const token of new Set(nameTokens(person.name))) {
      const owners = ownersByToken.get(token) ?? [];
      owners.push(person.id);
      ownersByToken.set(token, owners);
    }
  }

  const matched = new Set<string>();

  for (const person of roster) {
    const tokens = nameTokens(person.name);
    if (tokens.length === 0) continue;

    // Rung 1: the whole name, in order. `\b` is unreliable across scripts, so
    // the boundary is spelled out as "not a letter or number".
    if (tokens.length > 1) {
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])${tokens.map(escapeRegExp).join("[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`,
        "u",
      );
      if (pattern.test(textKey)) {
        matched.add(person.id);
        continue;
      }
    }

    // Rung 2: any single token this person alone owns.
    for (const token of tokens) {
      if (!textTokens.has(token)) continue;
      const owners = ownersByToken.get(token);
      if (owners && owners.length === 1) {
        matched.add(person.id);
        break;
      }
    }
  }

  return roster.filter((p) => matched.has(p.id)).map((p) => p.id);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Exposed for callers that want to show why a person was matched. */
export const __internals = { fold, fullNameKey };
