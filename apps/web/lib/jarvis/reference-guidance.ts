/**
 * Static prompt guidance that teaches JARVIS the entity-reference contract.
 *
 * Lives web-side (not in packages/jarvis-core) and is pushed into the system
 * array by run-turn, so it never touches the cache-critical prompt-builder or
 * its purity/stability tests. The text is a byte-stable constant — no dates, no
 * ids — so it caches cleanly inside the same prefix segment as the state
 * snapshot.
 *
 * It pairs with two dynamic halves elsewhere:
 *   - inbound: the `<referenced_entities>` block (resolve-references.ts) tells
 *     the model which ids the user pointed at this turn;
 *   - outbound: find/create tool results now carry a `ref` token string
 *     (reference-tokens.ts) the model can echo verbatim.
 */
export const REFERENCE_GUIDANCE = [
  "ENTITY REFERENCES:",
  "- A reference token looks like @[Label](ref://<type>/<uuid>) where <type> is capture|task|page|project|area|person. It renders in the UI as a clickable pill.",
  "- When a <referenced_entities> block is present, the user has pointed at specific existing entities. Bind their instruction to the exact id listed there — do NOT call a find_* tool to re-locate an entity that is already resolved for you.",
  "- When you name an entity you just acted on or found (created a task, found a capture, linked a person), emit its reference token so the user sees a pill. Copy the token verbatim from the tool result's `ref` field, or from a <referenced_entities> line, or from the session-entities scratchpad — never assemble one by hand.",
  "- NEVER invent, guess, or partially complete a uuid. Only emit a reference token whose id you have seen this turn in context or in a tool result. If you don't have a real id, just write the name in plain prose.",
  "- Reference tokens are for entities that live in this app. Do not wrap ordinary words, calendar events, or external things in them.",
].join("\n");
