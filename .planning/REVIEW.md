---
unit: wa-sync-launchd
reviewed: 2026-07-04
depth: standard
files_reviewed: 4
files_reviewed_list:
  - tools/whatsapp-sync/sync.mjs
  - tools/whatsapp-sync/com.hyperpolymath.whatsapp-sync.plist
  - tools/whatsapp-sync/README.md
  - tools/hyperpolymath/hyperpolymath.mjs
findings:
  blocker: 0
  major: 1
  minor: 3
  nit: 3
  total: 7
verdict: PASS-WITH-FLAGS
---

# wa-sync-launchd — Code Review

Verified against commit range `5de0159..HEAD` (four commits: `fac32b6`, `743419f`, `f55f4ad`, `9558f5a`).

## Summary

The unit meets all five stated acceptance criteria:

1. **sync.mjs default path** — Now `~/Library/Application Support/io.hyperpolymath.jarvis-desktop/whatsapp/whatsapp.db`, still env-overridable via `WHATSAPP_DB_PATH`. SELECT column list (`id`, `chat_jid`, `sender`, `content`, `timestamp`, `is_from_me` + `chats.name`) is a strict subset of the `captureSchema` in `tools/whatsapp-bridge/main.go` lines 149-166 (`messages(id, chat_jid, sender, content, timestamp, is_from_me, media_type)` + `chats(jid, name, last_message_time)`). Confirmed matches — no query change required.
2. **launchd plist** — Present, `plutil -lint` clean, has `RunAtLoad`, `KeepAlive`, sensible `ThrottleInterval=15`, stdout/err to `/tmp/whatsapp-sync.{out,err}.log`, env vars for URL + token. README documents install steps.
3. **hyperpolymath.mjs registration** — `wa-sync` entry follows the sibling `{name, color, preflight, start, keepAlive, ready}` shape. Preflight correctly skips when `JARVIS_DEVICE_TOKEN` is unset OR the capture DB is missing. `--no-wa-sync` works through the existing `FLAGS[\`no-${s.name}\`]` pattern (verified — parser treats hyphenated flag names as keys unchanged).
4. **README** — Header now calls the desktop bridge canonical; explicit "standalone `lharries/whatsapp-mcp` bridge is retired" note; env-var table default matches sync.mjs. Setup steps are executable.
5. **No ingest/schema changes** — `git log 5de0159..HEAD -- apps/web/app/api/whatsapp/ingest apps/web/drizzle` returns empty. Payload shape emitted by `tick()` at lines 145-157 exactly matches the Zod `messages[]` schema at `apps/web/app/api/whatsapp/ingest/route.ts:35-43`.

Verdict is **PASS-WITH-FLAGS** — one MAJOR issue (Apple-Silicon Node path) and a few minor rough edges that don't block landing but should be knocked down soon.

---

## Structural Findings (fallow)

None provided.

## Narrative Findings (AI reviewer)

### MAJOR

#### MA-01: Plist hardcodes `/usr/local/bin/node`, which doesn't exist on Apple Silicon Homebrew

**File:** `tools/whatsapp-sync/com.hyperpolymath.whatsapp-sync.plist:30`

**Issue:** `ProgramArguments[0]` is `/usr/local/bin/node`. On this exact machine (and any modern Apple Silicon Mac using Homebrew), Node lives at `/opt/homebrew/bin/node` — `/usr/local/bin/node` doesn't exist. `launchctl load` will succeed, but every relaunch will fail with `posix_spawn: No such file or directory` and the KeepAlive relauncher will spin against `ThrottleInterval=15s` for as long as the plist is loaded.

Verified on the review host:
```
ls /usr/local/bin/node → No such file or directory
which node             → /opt/homebrew/opt/node@20/bin/node
```

The README also silently reproduces this trap: sections 5 and the install snippet inside the plist header treat only the sync.mjs path and the token as "REPLACE-ME" placeholders, never flagging the node binary as machine-dependent. A user on Apple Silicon will follow the README verbatim and get a silently-failing launch agent.

**Fix:**
- Add a third REPLACE-ME callout in the plist header and README section 5 explicitly noting: "on Apple Silicon Homebrew, change `/usr/local/bin/node` to `/opt/homebrew/bin/node` (check `which node`)."
- Better still: change the default in the checked-in plist to `/opt/homebrew/bin/node` (since this is a personal-use single-user project on Apple Silicon per session context) and document the Intel fallback in the header.
- Best: use `<key>Program</key><string>/usr/bin/env</string>` with `<key>ProgramArguments</key>` = `["/usr/bin/env", "node", "..."]` so `PATH` resolves node. This trades one class of foot-gun (wrong path) for another (launchd's `PATH` is minimal — needs `EnvironmentVariables.PATH` set to include Homebrew), so option 1 or 2 is probably safer.

---

### MINOR

#### MI-01: `--no-mobile` is registered by the SERVICES loop but missing from `printUsage` and the header comment

**File:** `tools/hyperpolymath/hyperpolymath.mjs:12-18, 617-637`

**Issue:** The `SERVICES` array includes `mobile` (Metro/Expo), so the runtime `--no-mobile` flag works via `FLAGS[\`no-${s.name}\`]`. But the header docblock (lines 12-18) and `printUsage()` (lines 617-637) list every other service and its `--no-*` flag except `mobile`. Anyone reading `--help` will think mobile has no opt-out.

This predates this unit (the mobile entry was already in SERVICES before `f55f4ad`), so it's not caused by this branch — but this branch is the one that just re-touched both the header comment and `printUsage`. Worth fixing while adjacent.

**Fix:** Add `mobile      Expo dev server on :8081` to the Services section in both the header comment and `printUsage`, plus a `--no-mobile              skip Expo dev server` flag line.

#### MI-02: Plist's install snippet in the header comment lies about two REPLACE-ME placeholders

**File:** `tools/whatsapp-sync/com.hyperpolymath.whatsapp-sync.plist:12-14`

**Issue:** The header comment says "Edit the two REPLACE-ME placeholders below", but the file actually contains only one literal `REPLACE_ME` string (in `JARVIS_DEVICE_TOKEN`). The absolute path in `ProgramArguments[1]` uses `/Users/YOU/...` (a `YOU` placeholder, not `REPLACE-ME`) and there's a third machine-dependent value at `ProgramArguments[0]` (node path — see MA-01). "Two REPLACE-ME placeholders" is technically wrong on both directions: only one literal `REPLACE_ME` exists, but three values actually need per-machine edits.

**Fix:** Rewrite the install snippet to enumerate all three explicitly ("(1) `ProgramArguments[0]` = node binary, (2) `ProgramArguments[1]` = absolute path to sync.mjs, (3) `EnvironmentVariables.JARVIS_DEVICE_TOKEN` = your `hpd_...`; also flip `JARVIS_APP_URL` if pointing at Vercel").

#### MI-03: `wa-sync` uses `color: "magenta"` which collides with the existing `bridge` service

**File:** `tools/hyperpolymath/hyperpolymath.mjs:213`

**Issue:** The `bridge` service (line 171) is already `color: "magenta"`. `wa-sync` reuses the same magenta prefix. In the status bar and the interleaved log output both services will render with identical color coding, defeating the visual channel-separation the color scheme provides. Every other service (`supabase`, `web`, `desktop`, `mobile`, `bridge`) uses a distinct color.

**Fix:** Assign an unused color. The `C` palette exposes `cyan`, `magenta`, `yellow`, `green`, `blue`, `red`, `dim`, `bold` — of those, `cyan`/`magenta`/`yellow`/`green`/`blue` are taken by services. `red` is reserved for error logs. A new color (e.g. add `orange` / `bright-blue` via a 256-color escape) is warranted, or fold the color scheme into a real palette. Cheapest fix: reuse an existing color but pick one that's furthest visually from bridge — e.g. `wa-sync: "yellow"` collides with mobile but the two rarely both run under a single dev session, whereas bridge + wa-sync will very often both run together. Any pick that doesn't clash with bridge is better than the current state.

---

### NIT

#### NIT-01: Sentinel `senderName` fallback misleads the ingest payload

**File:** `tools/whatsapp-sync/sync.mjs:153`

**Issue:** `senderName: r.chat_name ?? r.sender ?? null` — for a group message, the chat name is the *group* name (e.g. "Family"), not the sender's display name. Setting `senderName = chatName` will mislead any downstream consumer (JARVIS `read_whatsapp` summarization, briefings) into thinking "Family" is a person. The inline comment even admits this is a known compromise. It's not a correctness regression (the previous worker did the same), but it's worth flagging as a debt marker.

**Fix:** Keep behavior for now; add a TODO tag with issue link so it isn't forgotten. Long-term, either enrich per-message via the whatsmeow contact store on the bridge side (adds a `sender_name` column to `messages`) or leave `senderName: null` for group chats so the consumer can't be tricked.

#### NIT-02: `toIso` silently falls back to `new Date()` on unparseable timestamps

**File:** `tools/whatsapp-sync/sync.mjs:115-122`

**Issue:** If `sqlite3` ever hands back a value `Date()` can't parse, the row is sent to the ingest route with `sentAt = now` — which the route will happily accept because it validates only that the string is parseable. This silently corrupts the temporal ordering of exactly the row that was already broken. The comment justifies this as "avoid dropping the row" but in practice a row with a wrong timestamp poisons every future cursor comparison downstream.

**Fix:** Log a warning line (`console.warn` with the raw value and the row id) so the drop is at least visible in `/tmp/whatsapp-sync.err.log`, or better, skip the row entirely so it never enters `whatsapp_messages` with a wrong timestamp. The bridge writes UTC RFC3339 (`captureSchema` line 160 + `storeMessage` line 200), so this path should be unreachable — logging when it does fire is proof-of-that.

#### NIT-03: README `Uninstall` step nukes cursor without warning about resume behavior

**File:** `tools/whatsapp-sync/README.md:151`

**Issue:** `rm ~/.jarvis-whatsapp-sync.json` in the Uninstall block loses the cursor. If a user later re-enables the worker without also truncating `whatsapp_messages`, the next `readNewRows` call will scan every message since `1970-01-01T00:00:00Z` (up to `BATCH`=200 per tick) and the ingest route will `onConflictDoNothing` them all — spammy but not corrupt. Not a bug, worth a one-line callout.

**Fix:** Add "(safe to re-run; the ingest route de-dupes on `(userId, chatJid, externalId)`)" after the cursor `rm` line so readers aren't scared.

---

## Verdict

`PASS-WITH-FLAGS`

The unit is functionally correct and satisfies every acceptance criterion in `.planning/bgsd-unit.json`. Only MA-01 (Apple-Silicon node path in the plist) is a real footgun for the person who'll actually run this. The rest are polish items that can ride in a follow-up. Nothing here justifies a re-plan.

_Reviewed: 2026-07-04_
_Reviewer: gsd-code-reviewer (Opus 4.7)_
_Depth: standard_
