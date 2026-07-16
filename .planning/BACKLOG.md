# Backlog / Queue

Quick-capture queue for ideas to pick up in a future bgsd sesh. Newest first.

## Per-block custom "loading text" instructions (routine blocks)

Add a per-repeatable-block field, toggleable in the web app (routine editor), that
lets the user give JARVIS **instructions** for what to say while that block is
fetching/working — e.g. on the "daily brief" block of the custom Morning Brief /
"I'm back home" routine: *"Say you're fetching my brief and that it'll be just a
moment."*

Crucial design point: these are **instructions, not verbatim script**. The LLM
interprets them and produces a **non-deterministic** spoken filler that stays
**semantically** the same but is phrased differently each time — simulating a human
who says the same thing in different words. This is the desired agent behavior, not
a fixed string.

- Storage: new optional field on the routine block spec (RoutineBlock).
- Web: toggle + textarea in the routine block editor.
- Runtime: while a block is gathering (esp. slow ones), synthesize a short spoken
  "one moment" line from the instruction via the LLM and speak it, before the
  block's real result. Pairs naturally with the existing routine progress /
  HUD loader.
- To be built in a dedicated bgsd sesh.

## WhatsApp read-path freshness (stale "I'm back home" WhatsApp data)

Diagnosis (not yet fixed): JARVIS reads WhatsApp via `read_whatsapp` from the
Postgres `whatsapp_messages` table, which is populated by a polling chain, NOT live:

- Incoming messages are mirrored only by the community bridge at `~/whatsapp-mcp`
  (its own `messages.db`). Our `tools/whatsapp-bridge` is **send-only** ("Scope:
  send + QR + health only").
- `tools/whatsapp-sync/sync.mjs` (launchd daemon, ~15s poll) reads new rows from
  that `messages.db` and POSTs to `/api/whatsapp/ingest` → Postgres.
- `read_whatsapp` reads the Postgres table point-in-time.

So "up to date last night, stale now" = the sync daemon and/or community bridge
wasn't running/linked, so nothing new was ingested. **Re-pairing the send-bridge
does NOT fix it.** Fix options for a bgsd sesh: make the pipeline reliably run
(supervise the community bridge + sync daemon like the send sidecar), or add an
on-demand history/refresh call the routine triggers before `read_whatsapp`.
