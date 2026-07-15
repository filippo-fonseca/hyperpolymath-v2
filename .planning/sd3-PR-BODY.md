# sd3 "Space Drive All Features" — `bgsd/sd-all-features` → `next`

Carries the Spacedrive (`--sd-*`) register across the **entire remaining web surface** and closes the session out. Sixteen isolated build units (fifteen surface/feature units + this closeout) each merged atomically to the `bgsd/sd-all-features` integration branch off `next`; every non-chrome feature page, the JARVIS console, the DEV tab, and the long tail now speak one chrome dialect. Frosted-white neumorphic glass is fully retired: the last residual `.glass-*` consumers were migrated and the dead CSS excised, the canon (`docs/DESIGN-SYSTEM.md` + the live `/design` route) was extended for everything sd3 added, and both themes verify with committed evidence. `main` is untouched; this is a human-reviewed `next` merge.

---

## The 16-unit ledger

Each unit ran in its own worktree on `sd3/<unit>` and merged as one commit.

| unit | one line | merge |
|---|---|---|
| unit-orb-sfx | Kiwi mark in both orbs + space-console SFX core pack | `3c03159e` |
| unit-primitives | shared `components/ui` primitives to the sd register (button/dialog/menus) | `adde4856` |
| unit-lifeos-rework | one-screen command deck + view toggle + project icon edit | `450f3b95` |
| unit-landing | landing body sections to the sd register | `15fb7059` |
| unit-sidebar-fixes | collapse-trap fix, opaque surface, EB Garamond wordmark, workspace dropdown removed | `09358c3a` |
| unit-journaling | `/journaling` to the sd register | `9ecd891c` |
| unit-habits | `/habits` to the sd register | `ed456ba8` |
| unit-training | `/training` + stats to the sd register | `1643898d` |
| unit-calendar | `/calendar` to the sd register | `90ef52b6` |
| unit-captures | `/captures` to the sd register | `07786c17` |
| unit-nutrition | `/nutrition` + stats to the sd register | `a3e95a46` |
| unit-jarvis | `/jarvis` console + routines/editors to the sd register | `7c3853b1` |
| unit-devtab | DEV/insights tab rebuilt as an sd console | `9ab1a46c` |
| unit-settings-misc | settings/people/graph/onboarding/tour + long-tail to the sd register | `776d8cf7` |
| unit-quick-wins | residual sweep, dark diagram SVGs, nutrition legend chips, SFX wiring, `animate-*` → `sd-fade-in` pass | `38291bff` |
| **unit-closeout** | glass excision (grep-proven), integration gates, canon docs, unified-focus-ring de-glow (D1), this dossier | `459e12fc`·`ec6f63ae`·`6309b67a`·`76185300`·`198d785c` |

---

## Sealed Conductor decisions & rulings

**User-sealed at the discuss gate (2026-07-15, UI-CONTRACT-SD3 §2):**
- Kiwi bird goes in **both** orbs (HUD status pill + presence sphere).
- SFX: a subtle core pack (~8 cues) + global mute; never noisy.
- LifeOS: Insights **folds into** the widget grid as a compact cell; the page fits one viewport.
- DEV/insights tab: **full sd rebuild** this session.
- Sidebar: workspace dropdown **removed** (it read as a workspace switcher); plain "Hyperpolymath" wordmark in EB Garamond; dedicated always-mounted collapse icon-button.
- Staging: everything merges to `bgsd/sd-all-features`; PR → `next` at the end; `main` untouched.

**Conductor process addendum (§3):** per-unit server hygiene by port only (never broad `pkill`); headless browser, one at a time, lockfile-serialized.

**In-flight rulings ratified during the run:**
- unit-primitives: accent-default + a single unified focus-ring ratio ratified; inert `animate-*` classes deferred to closeout (landed in unit-quick-wins' transition pass).
- unit-lifeos-rework: `h-full` one-viewport construction ratified; authed pixel pass batched to the Conductor on `:3000`.
- closeout is the **only** unit sanctioned to make `globals.css` deletions, each proven consumer-free by grep.
- Tester-r5 **D1** (composer glow layer) steered into closeout as a fence extension — root-caused to the shared `--ring-focus` token and de-glowed app-wide, keeping the crisp cyan ring; **D2** (hashtag rail vs inline tags) is a data-model behavior, queued (below).

---

## Verification story

- **Gates:** `pnpm --filter web typecheck` and `pnpm --filter web build` both green on the final tree (`✓ Compiled successfully`, full route table). Boot on `:3836`: `/` and `/design` → 200; zero application console errors (the only 4 are Vercel-analytics 404s that exist solely on prod infra).
- **Env caveat (infra, not code):** worktrees carry no `.env*`, so a bare build fails at page-data collection with `DATABASE_URL is not set` *after* a clean compile; a dummy `DATABASE_URL` (a static build never connects) makes it fully green. Same class as the known preview-build env gap.
- **Frames:** both-theme 1440×900 evidence for every changed surface is committed under each unit's `.planning/`. Closeout adds `/design` dark+light (viewport + full, showing the new §12–§15) and a landing-hero dark no-regression sentinel under `.planning/evidence/sd3-closeout-*`.
- **Tester:** Tester r5 delivered a **full authed pass — 11 PASS / 1 SKIP** (HUD pill is voice-only) with 26 frames; calendar showed its legit disconnected-fallback. Two defects surfaced: D1 fixed here, D2 queued. Earlier tester rounds (r1–r4) were repeatedly **infra-blocked** (Docker VM SIGKILLed by a sibling agent fleet cycling the same daemon) and re-dispatched with graceful-degradation orders until r5 landed clean.
- **Glass excision proof:** every excised class → 0 real consumers app-wide; 0 dead selectors/knob-refs remain in `globals.css`; braces balanced; net −153 lines. Full before/after table in `.planning/sd3-VERIFICATION.md`.

---

## Where the canon lives

- **`docs/DESIGN-SYSTEM.md`** — the written law. Extended in place: §9 WidgetCard v2 spread, §13 shared dimensional-icon recipe, and new §20 JARVIS console grammar, §21 data-series color law, §22 SFX core pack, §23 inline-style token routing (the sanctioned Tailwind scan-gap escape).
- **`/design`** — the living, public reference, rendered from the shipped tokens/utilities/primitives so it cannot drift. Now carries §12 SFX (a live playground bound to `lib/ui/sfx`), §13 data-series legend, §14 JARVIS console pills, §15 scan-gap escape.

Read the doc before touching UI; consume the shipped primitives and `.sd-*` utilities, not literals.

---

## Deferred / queued (not in this PR)

- **Desktop app UI restyle** — bring `apps/desktop` to the sd register. Queued: item-9006d9a8 / **GH #291**.
- **Hashtag rail vs inline tags** (Tester-r5 D2) — a data-model behavior change, not a restyle. Queued: item-b1703636 / **GH #293**.
- **Porcupine wake word, window management, local ElevenLabs key** — JARVIS HUD follow-ups (**GH #264**), out of the sd restyle scope.

---

*Do not merge without Filippo's explicit go-ahead. The Conductor opens this PR; build agents never touch `main` or the PR itself.*
