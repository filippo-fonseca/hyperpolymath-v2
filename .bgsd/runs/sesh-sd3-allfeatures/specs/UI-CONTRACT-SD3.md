# UI-CONTRACT — sesh-sd3-allfeatures ("Space Drive All Features")

Canonical design law: `docs/DESIGN-SYSTEM.md` (v2) + the live `/design` route. This contract ADDS session-specific law; where they conflict, DESIGN-SYSTEM.md wins unless a section here explicitly says otherwise.

## §0 Session law (every unit)
- Register: Spacedrive. sd tokens (`--sd-*`) everywhere. Space Grotesk app-wide; EB Garamond ONLY via `components/ui/Logotype.tsx`. Single cyan accent (`--sd-accent` / JARVIS cyan); red/amber functional only.
- BANS (delete on sight inside your fence): `.glass-tile`, `.glass-button`, `.lifeos-glass`, `backdrop-blur` (except a plain dim overlay may keep NO blur — solid rgba dim only), `bg-gradient` washes, glow rings/`shadow-glow`, hover scales, orbs > 40px, serif outside Logotype.
- Icons: dimensional icons from `components/ui/icons` for feature identity (18-36px); lucide 16px for verbs. Embrace the dimensional icon format everywhere a feature is named.
- Motion: zero-jank law (DESIGN-SYSTEM §14). opacity/transform only, 120-160ms, ease tokens, `useReducedMotion` guarded, never on first paint. Tasteful micro-animations ARE wanted this session ("space-travel clean") — use the existing `hud-*` keyframes + ease tokens, never invent janky ones.
- TAILWIND SCAN GAP (Scout B, verified): arbitrary utilities used ONLY in one file may not be emitted (e.g. `bg-[var(--sd-sidebar)]`, `font-logotype` were never generated). Prefer utilities already emitted elsewhere, real CSS classes in `globals.css`, or inline `style={{}}` for one-off var lookups. After any new arbitrary utility, VERIFY it in the compiled CSS or computed styles before claiming done.
- Cards: WidgetCard v2 grammar (`--sd-box`, rounded-[14px], border white/.06 → tokens, inset top hairline, chip strips). Stat tiles: icon-left grammar. Pills/chips per §6 of sd2 contract (now in DESIGN-SYSTEM).
- Both themes ALWAYS: dark = indigo ladder, light = warm parchment. Every surface must resolve through tokens in both. White-alpha literals are dark-only values — use tokens.

## §1 Process law (every unit)
- Isolated worktree, branch `sd3/<unit>`. NEVER touch files outside your fence. `components/ui/` primitives belong to unit-primitives ONLY (everyone else: consume, don't edit; assume button/dialog/menus become sd mid-session).
- Atomic commits with explicit pathspecs, constantly. Control file updated at every transition. Reread steering directive at all six checkpoints.
- Verification floor: `pnpm --filter web typecheck` + `pnpm --filter web build` green, boot clean, BOTH-theme screenshots (1440x900) of every changed surface committed under `.planning/`, then status=awaiting_review and WAIT for Conductor.
- Browser: HEADLESS only, ONE at a time globally. Acquire `while ! mkdir /tmp/bgsd-browser.lock 2>/dev/null; do sleep 10; done`, release `rmdir /tmp/bgsd-browser.lock` immediately after capture. Stale >15min reclaimable. NEVER hold the lock during builds.
- Auth: use the dev auth path on your assigned port; if a surface needs a session, capture the unauthenticated fallback and note it — the Conductor pixel-verifies authed surfaces on :3000 post-merge.

## §2 Sealed decisions (user, 2026-07-15)
- Kiwi bird goes in BOTH orbs (HUD status pill + presence sphere).
- SFX: subtle core pack (~8 cues) + global mute; never noisy.
- LifeOS: Insights folds INTO the widget grid as a compact cell; page fits one viewport.
- DEV/insights tab: full sd rebuild this session.
- Sidebar: workspace dropdown REMOVED (it read as a workspace switcher); plain Hyperpolymath wordmark in EB Garamond; dedicated always-mounted collapse icon-button.
- Staging: everything merges to `bgsd/sd-all-features`; PR → next at the end; main untouched.

## §3 Process addendum (Conductor, 2026-07-15)
- Server hygiene: stop ONLY your own server, by port (`kill $(lsof -ti tcp:<your-port>)`) or recorded PID. NEVER `pkill` broad patterns (`next`, `pnpm dev`, `node`) — the Conductor's :3000 review server and sibling units' servers are running.
