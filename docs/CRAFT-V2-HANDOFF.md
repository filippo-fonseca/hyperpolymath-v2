# Craft v2 handoff — finishing the sweep

Audience: the agent (Opus) building the remaining pages/features of hyperpolymath-v2
in the Craft v2 design language. Everything below is verified against the code on
branch `feat/craft-ui-v2` as of 2026-08-05. When this doc and the code disagree,
the code wins; update this doc.

## 1. What Craft v2 is

The July register gave the app three glass islands. Craft v2 (see
`.planning/quick/260804-craft-ui-v2/PLAN.md` and `CRAFT-LANGUAGE.md` for the
full derivation from Craft.do's screens) restructured that into:

- **One flat, calm canvas carries all chrome.** Sidebar, top bar, and dock sit
  directly on the canvas with no fill, border, or shadow (`.craft-canvas-chrome`).
- **Elevation belongs exclusively to content.** The active route paints on the
  single floating `.craft-sheet`; content cards are `.craft-card`; widget-density
  surfaces are `.craft-glass-tile`.
- **Color is data, never decoration.** Pastel comes only from the 8-hue tint
  system, and only to encode something (a status, an entity identity).
- **Quiet beats loud.** Craft's chrome is small, gray, and low-contrast.
  Metadata is faint text, not pills. One colored element per card, maximum.

## 2. The register (fixed API, `apps/web/app/globals.css` tail sections)

Unlayered classes — they intentionally beat Tailwind utilities (utilities live
in `@layer`, these don't). Compose them with utilities for geometry only.

| Class | Use |
|---|---|
| `.craft-sheet` | The one big route surface. Already applied by `Stage.tsx`; never add a second sheet. |
| `.craft-card` / `.craft-card-hover` | Raised white content card; hover moves shadow + border only (no scale/translate). |
| `.craft-glass-tile` | Widget-density glass (LifeOS bento tiles). Solid fallback included. |
| `.craft-glass` | Chrome glass (floating pills like the collapsed JARVIS bar). Reserve for chrome. |
| `.craft-glass-pop` | Frosted popover/menu/modal surface. Already cascaded onto `.sd-menu-surface` / `.sd-modal-surface`, so shadcn menus/dialogs frost for free. |
| `.craft-canvas-chrome` | Transparent chrome on canvas (sidebar, dock container, top bar). No fill/border/shadow. |
| `.craft-pill` | White pill chrome (cmd-K field, composers). Focus recipe built in (`:focus-within`). |
| `.craft-chip` | 28px segmented filter chip. Active state via `aria-pressed="true"` or `data-active` — never a stringified `false`. |
| `.craft-tinted` + `.tint-<hue>` | Pastel data plate. Hues: rose, peach, butter, sage, sky, lavender, lilac, plum. |
| `.craft-day-tile` | Agenda day tile; `[data-today]` gets the sky tint. |
| `.craft-backdrop` | The canvas wash. Applied once by AppShell; don't reapply. |

Deterministic entity color: `tintFor(id)` in `apps/web/lib/tint.ts`.
Task-status tints: `STATUS_TINT` in `apps/web/components/tasks/status.ts`.

## 3. Type and spacing rules (hard)

- Ladder only, six steps (globals.css ~117): `text-display` 30 / `text-title` 20 /
  `text-subtitle` 16 / `text-body` 14.5 / `text-meta` 13 / `text-micro` 11.5.
  `text-[Npx]` is banned. Three further steps (`text-hero` 44 /
  `text-headline` 32 / `text-lead` 18) exist for the LANDING PAGE ONLY; see §9.
- **Craft scale for UI chrome and card internals: `text-meta` primary,
  `text-micro` secondary.** Titles inside cards: `text-meta font-semibold`.
  `text-body` is for document/editor prose, not widget chrome. `text-subtitle`+
  is for page-level headings only.
- Metadata (dates, counts, sublabels): `text-micro` in `--ink-faint` /
  `--sd-ink-faint`. Low contrast is the point.
- Dates/counts/priorities are bare colored TEXT or a `size-1.5` dot — never a
  filled pill. Filled tint plates are for entity identity, not metadata.
- Accent budget: ~2 accent elements per viewport; at most 1 colored element per
  card.
- No uppercase outside `<kbd>` and eyebrow labels. Nothing animates under
  140ms. Hover changes shadow/border/background only — never scale.
- Every light-mode change ships its dark counterpart in the same commit
  (tokens do most of this automatically — verify, don't assume).

## 4. Hard invariants (violating these broke things before)

1. `@container/main` lives ONLY on the Stage scroll box. `PageScaffold` /
   `SidePanel` are U0-frozen contracts — do not restructure them.
2. Sidebar rows: no hover fill. The only sanctioned width animation is
   AppShell's `grid-template-columns`.
3. The LifeOS route `<main>` keeps `relative isolate` — its `-z-10` backdrop
   layer (now `LifeOsNodeField`) must not escape to the cockpit root, and must
   never be `position: fixed` (collides with the global fixed `AmbientGlow`).
4. Events live in Google Calendar only; never persist them in Postgres.
5. `.craft-chip` active state: set `aria-pressed={true}`/`data-active`
   conditionally; React renders `aria-pressed="false"` as a real attribute only
   if you pass the boolean — fine — but never pass a string.
6. Migrations: author idempotent SQL in `apps/web/drizzle/` AND mirror into
   `apps/web/supabase/migrations/` (the two dirs drift; see memory note).
   Never touch `drizzle/meta/_journal.json`.
7. **`cn()` knows the ladder — keep it that way.** `lib/utils.ts` extends
   tailwind-merge with the six `text-*` steps. Without that, tailwind-merge
   classifies them as text-COLOUR, so `cn("text-micro", "text-[var(--ink)]")`
   drops the size and the element inherits 16px. If you add a ladder step to
   globals.css, add it there too. Symptom to recognise: text rendering at
   16px with no size class in the DOM.
8. Uppercase is sanctioned for `<kbd>` and for eyebrow labels only. The three
   eyebrow primitives are the sidebar `SectionHeader` (carries
   `data-eyebrow`), settings `SectionEyebrow`, and the dev console `Eyebrow`.
   Everything else is sentence case.

## 5. Patterns that worked (copy these)

- **Cascade upgrade:** to restyle a shadcn/sd surface app-wide, append rules
  after the sd definitions in globals.css at equal specificity (see how
  `.sd-menu-surface` gained glass) instead of touching call sites.
- **Container queries for widget responsiveness:** `WidgetCard` declares
  `@container/widget`; internals adapt with `@max-[15rem]/widget:hidden` etc.
- **Craft page anatomy:** page header (title `text-title`, quiet toolbar of
  `.craft-chip` segments), content as `.craft-card`s or bare rows directly on
  the sheet with hairline separators
  (`border-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]`).
- **Row grammar:** 28px rows (`h-7` or `py-1.5`), title `text-meta` regular,
  trailing metadata `text-micro tabular-nums` faint, `hover:bg-[var(--hover)]
  rounded-lg` on interactive rows (except sidebar).
- **Empty/error/loading states:** LifeOS uses `components/ui/EmptyState`
  (`size="inline"`); dock uses `components/dock-widgets/dock-state.tsx`
  (`DockStateNote`). Pick the one matching the surface density.

## 6. JARVIS surfaces (post-queue architecture, aug-05)

- All sends are FIFO-queued, never aborted by a subsequent send. The bar
  (`components/shell/cockpit/JarvisCommandBar.tsx`) keeps a local `BarTurn`
  list; the console (`components/jarvis/JarvisConsole.tsx`) enqueues via
  `ConsoleJob`s with a client-only `"queued"` turn status. If you add a new
  send entry point, route it through the existing queue — do not call
  `streamJarvis` directly.
- `streamJarvis` has an `onAborted` callback distinct from `onError`.
  User-initiated stops finalize partial turns as `done` or drop empty
  placeholders; they never persist error turns.
- The bar renders real receipts (`JarvisReceipt variant="compact"`,
  `JarvisClarification`, `renderInlineMarkdown` + `stripSystemTags`). Bar and
  console share one `jarvis_turns` thread per user; sync is DB + Supabase
  realtime merge-by-id, not shared client state.

## 7. Verification recipe

1. `pnpm verify:bootstrap` from the repo root: local Supabase (Docker) +
   migrations + seed + minted auth cookie (`.verify/storage-state.json`) + dev
   server on :3100 signed in as `verify-harness@hyperpolymath.test`.
   Never hand-write the `sb-127-auth-token` cookie.
2. If styles look impossibly absent: a dev server that boots after a prod
   build restores a stale Turbopack CSS compile from the shared `.next`.
   `rm -rf apps/web/.next` and re-bootstrap.
3. If seeding hits duplicate keys: `supabase db reset` from `apps/web`, then
   re-bootstrap. Never hand-patch seed data.
4. Gates per unit: `pnpm -C apps/web typecheck`, targeted vitest suites, and
   authenticated light + dark screenshots of every touched surface.
5. Playwright MCP auth: write the cookies from `.verify/storage-state.json`
   into a snippet under `.playwright-mcp/` and `page.context().addCookies(...)`
   via run-code; direct fs reads from the MCP process are blocked.

## 8. Git discipline

- Small focused commits per logical unit, explicit pathspecs (never
  `git add -A`). Never push to main; feature branches push freely. Never merge
  without Filippo's explicit go-ahead.
- Parallel agents in one tree: give each a disjoint file fence and an
  index.lock retry protocol (2-5s wait, ≤5 retries). It worked for 6 units
  with zero collisions.

## 9. What's done vs what's left

Done in Craft v2 (aug-04/05): shell (sidebar, top bar with cmd-K pill,
floating JARVIS pill, chromeless dock, stage sheet), LifeOS (node-field
backdrop, quiet widgets), Tasks (chip filters, bare-row list, lifted board),
Wiki (carded explorer, day tiles, sheet editor), glass menus/dialogs
everywhere, neutral scrollbars, JARVIS queue + receipts.

Swept aug-05 (the remaining feature surfaces): **Areas, Projects incl.
timeline, Calendar, Captures, Search, Habits, People, Journal, Briefing,
Insights, Settings, Training, Nutrition, Graph, onboarding**, plus the JARVIS
routes, voice, and the leftover px in surfaces already passed. Segmented
"raised plate on a recessed track" controls are gone app-wide in favour of
`.craft-chip`; hand-rolled card recipes resolve to `.craft-card` /
`.craft-card-hover`; search and composer fields are `.craft-pill`; the
calendar grid header consumes `.craft-day-tile`.

**The landing page** was swept too, on its own terms. Its docs claimed a closed
`{14, 18, 32, 56}` scale but it had drifted to eighteen arbitrary px sizes.
Forcing app chrome steps on it would shrink a long-form marketing page into
UI proportions, so the theme gained three named editorial steps —
`text-lead` 18 / `text-headline` 32 / `text-hero` 44 — and the landing page now
uses those plus the app ladder. Nine names, no arbitrary px.

**Those three are landing-only.** App chrome is the six steps. A cockpit
surface reaching for `text-hero` is a mistake.

Remaining exemptions:

- `/design` and `/branding` are specimen pages: they must be able to show
  off-register type.
- **`PagePreviewThumb`** keeps 7/8px and **`LifeosCanvasPreview`** keeps its
  SVG label sizes: both render scaled miniatures of the app, so their type is
  artwork, not chrome.
- The landing hero's three `clamp()` sizes stay fluid — a responsive wordmark
  is not a ladder step.

`text-sm` / `text-xs` survive in a few leaf spots (`<kbd>` hints, mini-calendar
day numbers). They are Tailwind scale steps, not the banned `text-[Npx]`.

Known follow-ups: `LiteJarvisComposer` still carries `craft-glass-tile` under
the QuickSend pill override; `page-block-editor.css` duplicates the
`.craft-glass-pop` recipe (BlockNote menus take no className) and must track
it; overlay glass alpha (`--glass-panel-bg` 66%) reads near-solid — tune only
with Filippo's sign-off; EB Garamond on wiki page titles is HIS call, the type
contract currently reserves serif for the logotype.
