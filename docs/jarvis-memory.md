# JARVIS memory

JARVIS has two memory layers: short-term conversation memory (scoped to the
current session) and long-term fact memory (persisted across all sessions).

---

## Conversation memory

When using JARVIS via voice on the desktop, each turn fires cold — the model sees
only the current utterance. Without conversation context, pronoun and entity
references across turns break: if you say "text Rohan" and JARVIS confirms, then
you say "send him a voice note", JARVIS would not know who "him" is.

To fix this, each JARVIS turn loads the most recent turns from the `jarvis_turns`
table and threads them into the prompt before the current utterance. Two parameters
bound the context:

- **Window:** only turns from the last 15 minutes are included. Turns from an
  earlier session are dropped so stale context never bleeds into a fresh
  conversation.
- **Cap:** at most 12 turns are loaded, regardless of how active the recent window
  was. This keeps prompt size and token cost bounded.

Only plain user text and JARVIS prose are threaded in — not raw tool-use or
tool-result blocks. That is all pronoun/entity resolution needs. The within-turn
agentic loop (read context, act, react) continues to run its own tool-result
cycle inside `run-turn.ts`.

---

## Long-term memory

Facts about you — relationships, contact preferences, standing instructions,
recurring habits — are stored in the `jarvis_facts` table and injected into the
cached system prompt on every turn. They are effectively pre-loaded into context
at zero per-turn latency cost once cached.

**Explicit saves.** The `remember_fact` tool lets you save a fact directly: "JARVIS,
remember that Rohan is my brother." JARVIS confirms, the row is written immediately
via an `onConflictDoUpdate` on the `UNIQUE(user_id, type, key)` index, and a
5-second undo window is offered.

**Automatic extraction.** After each turn completes, a fire-and-forget Haiku call
runs over the recent exchange and reconciles it against your current memory:

- If the exchange reveals a new durable fact ("Rohan is reached on WhatsApp"),
  an `upsert` is emitted and the fact is written with source `jarvis_suggested`.
- If a new statement updates a fact already in memory ("actually reach Rohan on
  iMessage"), the Haiku call reuses the existing key and overwrites the value in
  place — no near-duplicate rows are created.
- If you retract a fact ("forget that I prefer morning workouts"), a `delete` is
  emitted for that exact key.

The Haiku call is entirely fail-closed: any error (network, parse, database) is
swallowed with a console warning. It never throws into the caller and never delays
the SSE stream closing. The guard rails are strict: the model only deletes facts
it was explicitly shown in the prompt, and a cap of 10 operations per turn
prevents a runaway response from bloating or nuking memory.

**Fact types.** Facts are categorized as `entity` (a person, place, or thing and
its attributes), `preference` (how you like things done), `rule` (a standing
instruction), or `workflow` (a recurring multi-step routine). Keys are
dot-scoped by convention — for example, `rohan.messaging_app` — so a later update
to the same concept overwrites the same row rather than spawning a duplicate.

---

## Summary

| Layer | Scope | Source | Lifetime |
|---|---|---|---|
| Conversation memory | Current session (15 min window, 12 turns) | `jarvis_turns` | Until window expires |
| Long-term facts | All future turns | `jarvis_facts` | Until overwritten or deleted |

Conversation memory handles short-lived references within a session; long-term
memory handles durable facts that should be true across days and sessions. Both
layers are injected automatically — you do not need to do anything to activate
them.
