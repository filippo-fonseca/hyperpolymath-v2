# `hyperpolymath` — one-command dev stack

Boots the whole Hyperpolymath / JARVIS local stack with a single command and
keeps it alive under one terminal, with a live status bar pinned to the bottom.
`Ctrl+C` tears everything down cleanly.

```bash
hyperpolymath
```

## What it starts

Services come up **in order**; each waits until it's actually ready before the
next begins.

| # | Service    | Port      | What it is                                                        |
|---|------------|-----------|-------------------------------------------------------------------|
| 1 | `supabase` | `:54321`  | Local Supabase stack (Postgres + Auth + Storage) via `supabase start` (Docker). Idempotent. |
| 2 | `web`      | `:3000`   | Next.js dev server (`pnpm dev`, Turbopack).                       |
| 3 | `desktop`  | —         | Tauri desktop app (global hotkey + composer; no hardware needed). |
| 4 | `bridge`   | serial    | ESP32 → HTTP wake-word serial bridge for the optional Polypad.    |

Each service has a **preflight** that skips it gracefully when its prerequisite
is missing — so a partial environment still boots the rest of the stack:

- **`supabase`** skips if Docker isn't running (start Docker Desktop, re-run).
- **`web`** skips *starting* if port 3000 is already in use (assumes an existing
  dev server) but still treats it as ready.
- **`desktop`** skips if `cargo` isn't on `PATH` (install Rust to run Tauri).
- **`bridge`** skips if no `/dev/cu.usbmodem*` device is present, or if another
  process (e.g. Arduino IDE Serial Monitor) is holding the port. A stale
  bridge from a previous run is killed automatically.

## Flags

```
--no-supabase           skip Supabase (e.g. when pointing at a remote project)
--no-web                skip the Next.js dev server
--no-desktop            skip the Tauri desktop app
--no-bridge             skip the serial bridge (no ESP32 plugged in)
--only=name[,name...]   start ONLY the listed services
--help                  print usage and exit
```

### Examples

```bash
hyperpolymath                      # everything
hyperpolymath --no-bridge          # everything except the ESP32 bridge
hyperpolymath --no-desktop         # web + supabase + bridge (no Tauri build wait)
hyperpolymath --only=web,supabase  # just the web app and its database
```

`--only=` is the fast path for day-to-day web work: it skips the desktop app's
2–5 minute first-build cargo compile.

## How the command resolves

`hyperpolymath` on your `PATH` is a symlink into this repo:

```
/opt/homebrew/bin/hyperpolymath  ->  tools/hyperpolymath/hyperpolymath.mjs
```

The script has a `#!/usr/bin/env node` shebang and is executable, so the symlink
runs it directly. On a fresh machine, recreate the link with:

```bash
chmod +x tools/hyperpolymath/hyperpolymath.mjs
ln -sf "$(pwd)/tools/hyperpolymath/hyperpolymath.mjs" /opt/homebrew/bin/hyperpolymath
```

(Adjust the bin directory if your `PATH` prefers a different one, e.g.
`~/.local/bin`.)

## Adding a new service

Append an entry to the `SERVICES` array in `hyperpolymath.mjs`. Each service is:

```js
{
  name,            // short id used in flags (--no-<name>, --only=<name>) and the status bar
  color,           // ANSI color key for its log prefix
  port,            // optional label shown in the status bar
  async preflight() { /* return { skip } | { skipStart } | { env, port } to opt out / inject */ },
  start(pre) { /* return a spawned child process */ },
  ready(proc) { /* resolve once the service is actually up (waitForHttp / waitForLog) */ },
  keepAlive,       // true → a clean exit of this process tears the whole stack down
}
```

Helpers available: `waitForHttp(url, timeoutMs)` (any HTTP response counts as
alive) and `waitForLog(proc, regex, timeoutMs)` (match a startup line). Mark
long-running servers `keepAlive: true`; one-shot bootstrappers (like `supabase
start`, which exits after booting its containers) `keepAlive: false`.

> Keep this table and the one in `DEPLOYMENT.md`'s "Local dev quick refs" in sync
> when you add a service.
