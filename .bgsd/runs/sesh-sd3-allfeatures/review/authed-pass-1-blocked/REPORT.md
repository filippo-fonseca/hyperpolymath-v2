# sd3 AUTHED VERIFY — authed-pass-1

**VERDICT: BLOCKED — cannot authenticate; local Supabase stack is down (docker wedged on a 100%-full disk).**

## Environment facts (all measured, not assumed)
- `:3000` dev server is UP: `curl localhost:3000/` → 200; `/lifeos` → 307 → `/sign-in` (auth enforced). Not restarted.
- App's configured Supabase target = **LOCAL only**: the sole real URL inlined in the client bundle is `http://127.0.0.1:54321` (all other `*.supabase.co` hits are SDK placeholders: xyzcompany/project-id/realtime/example).
- Local Supabase is **DOWN**: `curl 127.0.0.1:54321/auth/v1/health` → `000`; in-browser `fetch(:54321/auth/v1/health)` → `Failed to fetch`.
- **Docker daemon is wedged**: `docker ps` hung 2 min (SIGTERM 143); `docker version` never returned. Root cause = disk full.
- **Disk 100% full**: `df -h` → Data volume `/System/Volumes/Data` 420Gi used, **2.7Gi avail, 100% capacity**. (Sandbox Bash also fails with ENOSPC on its per-call temp dir; had to run unsandboxed.)
- Sign-in UI offers **Google OAuth ONLY** — no email/password form (snapshot: single "Continue with Google" button). No browser cookies present.

## Why auth is impossible here
- The brief's authorized bypass (mint `dev@local.test` via the LOCAL service key + supabase-js to get cookies) REQUIRES `127.0.0.1:54321` up. It is down and un-startable: docker is hung and `supabase start` would pull/run ~10 containers into 2.7Gi — unsafe (would risk driving disk to 0 and killing the live :3000 server / the running sd3 run).
- Reusing a prior session also fails: no cookies exist, and `getClaims` JWT validation needs the (down) local auth server.
- The only UI path is Google OAuth, which cannot be completed in this non-interactive headless session.
- Prod/remote Supabase is off-limits per brief ("LOCAL keys only, never touch prod").

Per brief: restarting infrastructure is out of scope; Google-OAuth-only + dead local stack ⇒ report BLOCKED with proof.

## Capture list result
Items 1–13: **BLOCKED** — not attempted; no authenticated session obtainable.
Only frame captured: `sign-in-BLOCKED-evidence-dark.png` (1440×900) — proves auth wall is Google-only and app renders.

## Remediation to unblock a re-run
1. Free disk on `/System/Volumes/Data` (needs real headroom, not 2.7Gi). Do NOT delete the live sd3 run worktrees (`.bgsd/runs/sesh-sd3-allfeatures/worktrees/unit-*`) or the locked `.claude/worktrees/agent-*` — they belong to in-flight work. Safer targets: `docker system prune -a --volumes` (after docker recovers), stale build caches (`target/`, `node_modules`, `.next`) in dead checkouts, `~/Library/Caches`.
2. Restart Docker Desktop, then `cd apps/web && npx supabase start`; confirm `curl 127.0.0.1:54321/auth/v1/health` → 200.
3. Re-dispatch this brief; the supabase-js `dev@local.test` mint path will then work.
