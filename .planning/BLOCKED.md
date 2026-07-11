# Action bridge live verification blocker

Date: 2026-07-11

## Blocker

Local Supabase/Postgres is not accepting connections on `127.0.0.1:54322`.
The worktree web server starts and builds successfully, but paired-device bearer
authentication queries the local database before the Studio API and SSE route
handlers run. Consequently, authenticated curls and the desktop SSE connection
return HTTP 500 with `ECONNREFUSED`.

Docker Desktop processes are present, but both Docker socket health checks timed
out, so starting the Supabase stack safely was not possible during verification.

## Remaining live checks

After Docker is healthy:

1. From `apps/web`, run `pnpm dlx supabase start` and confirm port `54322` accepts connections.
2. From the repository root, run `pnpm --filter web dev`.
3. With the existing desktop device token, curl the four `/api/studio/*` routes and require HTTP 200 JSON responses.
4. With the desktop app running, speak “open the weather widget,” then “close it,” and verify the stage changes.
5. Confirm a WhatsApp voice send and verify the card appears only after successful delivery.
6. Trigger a tool result containing an HTTP(S) URL and verify a browser widget appears.
7. Stop the worktree web dev server.

No code failure was observed in automated tests, typechecks, or builds. This file
records only the missing environment-dependent live acceptance evidence.
