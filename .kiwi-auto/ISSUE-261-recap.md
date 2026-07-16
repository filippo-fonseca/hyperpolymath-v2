# Issue #261 recap — Harden link-preview fetch (SSRF + unbounded body)

**Status:** RESOLVED (completed)
**Branch:** `kiwi/auto/2026-07-12-issue-261` (no push, no merge — awaiting review)
**Pipeline:** GSD quick (`/gsd:quick`), inner worktree isolation disabled for this run (`workflow.use_worktrees=false`) — all commits landed directly on the current branch, no nested worktrees.

## Doability assessment

GOOD fit. Small, self-contained, and certain: a single-module security hardening (`apps/web/lib/link-preview/fetch.ts`) with two unambiguous acceptance criteria (private-IP/SSRF filter + streamed body cap), Node-runtime built-ins only, no new dependencies, no DB migration, no design questions. Well inside the 45-minute unattended cap.

## What the issue asked for

From a prior REVIEW.md (MAJORs 1–2):
1. **SSRF** — `fetch.ts` had no host/DNS private-IP filter, so `169.254.169.254` (cloud metadata), `localhost`, and RFC1918 ranges were reachable, and `redirect: "follow"` let a public URL redirect into an internal target.
2. **Unbounded body** — `fetchGeneric` called `await res.arrayBuffer()`, buffering the entire response before slicing to the 1.5MB cap.

## What shipped

Three atomic commits on `kiwi/auto/2026-07-12-issue-261`:

- `94d1db5c` feat(link-preview): add SSRF IP classifier + async host guard
  - New `apps/web/lib/link-preview/ssrf.ts` (Node built-ins only): `isPrivateAddress()` covering IPv4 loopback / RFC1918 / link-local (incl. metadata endpoint 169.254.169.254) / CGNAT / TEST-NET / multicast+reserved, and IPv6 loopback / unspecified / link-local `fe80::/10` / unique-local `fc00::/7` / IPv4-mapped `::ffff:...`; fails closed on any non-IP. `assertHostAllowed()` blocks IP-literal hosts and DNS-resolves hostnames, rejecting if any resolved address is private (DNS-rebinding guard).
  - New `apps/web/tests/link-preview-ssrf.test.ts`: pure, no-network Vitest matrix over blocked (127.0.0.1, 10.0.0.1, 192.168.1.1, 169.254.169.254, ::1, fc00::1, 172.16.0.1) and allowed (8.8.8.8, 1.1.1.1, public IPv6) addresses.
- `e62acc89` fix(link-preview): guard every fetch hop against SSRF with manual redirects
  - `fetchWithTimeout` switched from `redirect:"follow"` to `"manual"`, validates every hop's host + http(s) protocol via `assertHostAllowed`, follows at most 5 hops, reuses one `AbortController` so the 6s budget still holds. Closes the redirect-to-internal hole.
- `458a7f94` fix(link-preview): stream generic body with an incremental size cap (**Closes #261**)
  - `fetchGeneric` now reads via `readCappedText` (a `getReader()` loop that accumulates up to `MAX_HTML_BYTES` and cancels the download once the cap is hit) instead of `res.arrayBuffer()`, preserving the decode-to-1.5MB semantics.

## Preserved behavior / contract

- Module's "never throws" contract intact: SSRF blocks, non-http(s) redirect targets, redirect overflow, and size-cap trips all propagate to the existing `fetchLinkPreview` try/catch and degrade to `errorResult`.
- No hostname allowlist added, so legitimate public oEmbed calls (YouTube `youtube.com`/`i.ytimg.com`, Twitter `publish.twitter.com`) pass the guard naturally.
- 6s timeout, MAX_HTML_BYTES=1.5MB, user-agent, content-type gating, and relative og:image resolution unchanged.

## Verification (actual)

- `pnpm --filter web test -- link-preview` → 11 passed (5 SSRF + 6 classify), no network.
- `pnpm --filter web typecheck` (`tsc --noEmit`) → clean, zero errors.

## Scope / diff

3 files: `apps/web/lib/link-preview/fetch.ts` (+64/-7), new `apps/web/lib/link-preview/ssrf.ts` (73 lines), new `apps/web/tests/link-preview-ssrf.test.ts` (49 lines). No new dependencies, no migration.

## Notes / follow-ups (non-blocking)

- There is a residual TOCTOU seam: `assertHostAllowed` resolves DNS, then `fetch()` resolves again independently, so a determined DNS-rebinding attacker could theoretically differ between the two lookups. Fully closing this would require pinning the validated IP into a custom `lookup`/agent. Deliberately out of scope for this hardening pass (the issue asked for IP filtering + streamed cap); worth a future ticket if the threat model tightens.
- Not pushed, not merged: per run rules, no `git push` and no destructive git. Ready for human review/merge of the branch (the final commit's `Closes #261` will auto-close the issue on merge).
