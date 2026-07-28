# Verification harness

How to drive this app headlessly, signed in, against a local Supabase.

Three wave-1 units of the jul-28 sesh reported the same blocker: acceptance
criteria could only be argued at code level, because the app could not be
opened in a browser from a build worktree. `/wiki` 307s to `/sign-in`,
authentication is Google OAuth with no headless path, and the local Supabase
stack was not running. This is the thing that closes that gap.

---

## TL;DR

```bash
pnpm verify:bootstrap   # Supabase up, migrations, seed, storageState, dev server on :3100
pnpm verify:e2e         # headless Chromium proof + evidence screenshots
```

or `pnpm verify` for both. The app comes up at <http://localhost:3100>, already
signed in as a local-only fixture account with realistic data on every page.

---

## What the bootstrap does

`apps/web/scripts/verify/bootstrap.mjs`, in order:

1. Starts the local Supabase stack if it is down (`supabase start`).
2. Applies pending migrations (`supabase migration up --local`).
3. Runs the schema drift report and fails the run if the live database cannot
   serve `lib/db/schema.ts`.
4. Seeds the fixture account and its data.
5. Writes a Playwright `storageState`.
6. Boots `next dev` on a fixed port.
7. Asserts the cookies actually authenticate against the running app, then
   prints the URL.

Every step is idempotent. A running stack is reused, migrations are guarded,
fixtures upsert on deterministic ids, and a server already listening on the port
is adopted rather than duplicated. Run it as many times as you like.

Artifacts land in the gitignored `.verify/` directory at the repo root:

| File | What it is |
|---|---|
| `.verify/storage-state.json` | Playwright storage state. Load this to be signed in. |
| `.verify/credentials.json` | The generated fixture password. Local-only, never committed. |
| `.verify/dev-server.log` | stdout/stderr of the backgrounded dev server. |

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm verify:bootstrap` | The whole thing. Add `--no-serve` to skip the dev server. |
| `pnpm verify:seed` | Account and fixtures only. |
| `pnpm verify:auth` | Re-mint `storage-state.json`. Use this if a session goes stale. |
| `pnpm verify:drift` | The schema drift report on its own. Read-only. |
| `pnpm verify:e2e` | Playwright spec plus evidence screenshots. |
| `pnpm verify:typecheck` | Typechecks the harness's root-level TS. |
| `pnpm verify` | `verify:bootstrap && verify:e2e`. |

`VERIFY_PORT` overrides the port (default 3100). `VERIFY_EVIDENCE_DIR`
overrides where the spec writes screenshots.

---

## How sign-in works, and why it is safe

Google OAuth cannot run headless, so the harness creates a **dedicated
email/password account on the local stack only**, through the Supabase admin
API, using the service-role key read at runtime from `supabase status`.

Nothing in the application changed. There is no test-only bypass, no
environment flag that skips auth, and no new sign-in route. Production still
has exactly one sign-in path, and a deployed environment has no way to reach
any of this. Two guardrails enforce that:

- `supabaseEnv()` throws unless the Supabase URL is `127.0.0.1` or `localhost`,
  so the admin API can never be pointed at a real project.
- The Playwright spec includes a test that drives a **cookie-less** context and
  requires it to still be bounced to `/sign-in`. If the harness had weakened
  auth, that test fails.

No secret is committed. The service-role key is read from `supabase status` at
runtime; the fixture password is generated on first run into gitignored
`.verify/credentials.json`.

### The cookie detail that matters

Do not hand-write the auth cookie. It is tempting: call `signInWithPassword`,
take `data.session`, write an `sb-<ref>-auth-token` cookie. It does not work,
and it fails in the least debuggable way possible, with a 307 to `/sign-in` and
no error anywhere.

`@supabase/ssr` derives the cookie name from the project URL (on this stack it
comes out as `sb-127-auth-token`, not the project ref you would guess), prefixes
the value with `base64-`, and **chunks it across `<name>.0`, `<name>.1`, ...**
once it exceeds the per-cookie size limit. The current value is ~2.7KB, close
enough to that threshold that a small change to session contents would start
chunking.

So `storage-state.mjs` hands `createServerClient` an in-memory cookie jar and
lets the library itself emit whatever names, encoding and chunks it wants. The
harness and the app agree by construction rather than by assumption. If you
change how auth cookies work, this keeps working.

---

## Fixture data

Seeded for `verify-harness@hyperpolymath.test`, all with deterministic v5 UUIDs
so re-runs update rather than duplicate:

- 1 area (Academics) with 1 project (Thermodynamics, a class)
- 7 tasks across the priority and status range, **at least one due today**
- 2 nested wiki folders (Course notes > Thermodynamics), one linked to the
  project, with 4 pages
- 3 habits with completions over the last few days
- 3 captures
- today's Daily Page

Two of those are load-bearing, not decoration:

**Today's Daily Page.** `components/shell/DailyAutoOpen` is mounted app-wide.
When today's Daily Page does not exist it creates one and `router.push()`es to
`/wiki/<id>` **from any route**. A browser opening `/tasks` therefore lands on
the wiki, which looks exactly like a routing bug. Once the page exists the
component leaves you alone, so the fixture is the fix and no app code changes.

**A task due today.** `/tasks` defaults to a day-scoped kanban. Fixtures dated
only in the future render an empty board that is indistinguishable from a broken
query.

`onboarded_at` is also set explicitly on the `public.users` row, because
`requireOnboarded()` bounces a null to `/onboarding`, which reads as an auth
failure from the browser.

---

## The two migration directories

This repo describes its schema in three places and they drift:

| Source | Feeds | Applied by |
|---|---|---|
| `apps/web/drizzle/` | production | by hand, idempotently (the journal is intentionally stale) |
| `apps/web/supabase/migrations/` | local dev | `supabase start` / `supabase db reset` / `supabase migration up` |
| `apps/web/lib/db/schema.ts` | every Drizzle query | n/a, it is what the app assumes |

A new migration must land in **both** directories in the same commit. When it
does not, local dev builds a database the app cannot serve, and the failure only
appears from a clean build, so a long-running hand-patched local DB hides it.
Migration `0049` was written to end this; it recurred anyway and `0055` fixes
round two.

`pnpm verify:drift` reports all of it. Section A is the one that fails a run:
the live DB versus `schema.ts`. Sections B, C and D report which of the two
migration directories is behind.

The drift is bidirectional. 21 tables exist only in `supabase/migrations/` and
have never been in `drizzle/` (habits, journal_entries, people, nutrition,
training, page_folders and others). Those are local-only artifacts of how the
schema grew; production has them because they were applied another way.
Collapsing the two directories into one source is the real fix and is still
undone.

To check that a **fresh** stack would be correct without destroying your local
data, use the CLI's shadow database rather than a reset:

```bash
cd apps/web && supabase db diff --local --schema public
```

`No schema changes found` means the full migration chain rebuilds exactly the
schema you are running.

---

## Using it from a Tester lane

```ts
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: ".verify/storage-state.json",
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
await page.goto("http://localhost:3100/wiki");
```

Assert on three things, not one. `tests/verify/authenticated-routes.spec.ts` is
the worked example:

1. the URL does not contain `/sign-in`;
2. an authenticated-shell element is present (a nav link to a sibling app route
   exists only inside the `(app)` layout, which is gated by
   `getUserOrRedirect()`);
3. a known fixture string is visible, which proves the page queried the database
   as this user and got rows back.

Without the third, a route that renders an empty shell passes.

---

## Troubleshooting

**A route 307s to `/sign-in`.** The session expired; the local stack's
`jwt_expiry` is 3600s. Run `pnpm verify:auth` to re-mint the storage state.

**A route lands on `/wiki/<id>` instead of where you navigated.** `DailyAutoOpen`
fired, meaning today's Daily Page does not exist. Run `pnpm verify:seed`.

**A route lands on `/onboarding`.** The `public.users` row has a null
`onboarded_at`. Run `pnpm verify:seed`.

**`supabase status` reports nothing.** Docker is not running, or the stack is
down. `pnpm verify:bootstrap` starts it.

**Playwright cannot find a browser.** `pnpm exec playwright install chromium`.

**The dev server did not come up.** Read `.verify/dev-server.log`. Port 3100 is
the default so it does not collide with a normal `pnpm dev` on 3000.

**The dev server died right after the command finished.** It is spawned
detached and survives a normal shell, but some agent harnesses and CI wrappers
kill the whole process group when the command they invoked exits, which takes
the server with it. If you are driving this from such a wrapper, run
`pnpm verify:bootstrap` and `pnpm verify:e2e` as two separate invocations rather
than chaining them through `pnpm verify`, so the server is not a child of the
process being reaped.

**Stopping the server.** `lsof -ti:3100 | xargs kill`. Nothing stops it
automatically, by design: the Tester lane wants it to stay up between runs.
