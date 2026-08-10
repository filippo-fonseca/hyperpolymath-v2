# Mobile v2 rebuild (#381)

Ground-up rebuild of the iPhone app. Essentials only: **Jarvis (center home), Wiki, Tasks, Habits, Captures**, plus three iOS home-screen widgets (tasks, habits, quick capture). UI matches the web app's **craft** design register. This file is the architecture contract: every build lane follows it, and lanes only touch the files they own.

## Stack

Expo SDK 56 / RN 0.85 / React 19.2, TypeScript strict. New in v2: **expo-router** (file routes, typed), **TanStack Query 5** (all reads, optimistic mutations), **Reanimated 4 + worklets** (all animation off the JS thread), **FlashList 2** (all long lists), expo-haptics. Kept from v1: supabase-js (auth only), expo-secure-store, expo-auth-session, expo-audio, expo-speech-recognition, react-native-sse, expo-widgets + @expo/ui, BlockNote DOM editor via `@expo/dom-webview`.

Backend contract is unchanged and lives on the web app:
- CRUD: bearer-auth REST `/api/device/{tasks,habits,captures,projects,wiki/*}` (Authorization: Supabase JWT or `hpd_` device token).
- Jarvis: `POST /api/jarvis/voice/{text,transcript,cancel,undo}`, `GET /api/jarvis/voice/turn?id=`, `POST /api/jarvis/tts` (PCM). Responses stream over the separate SSE bus `GET /api/jarvis/physical/events` (`jarvis-response-start|chunk|end`, `jarvis-tool-call`, `transcript`).
- Bootstrap: `GET /api/mobile/bootstrap` → `{supabaseUrl, supabaseAnonKey}`.

## Directory layout

```
apps/mobile/
  app/                       # expo-router (owned by shell lane)
    _layout.tsx              # fonts, ThemeProvider, QueryClientProvider, auth gate, SSE provider, GestureHandlerRootView
    sign-in.tsx
    settings.tsx             # modal: server URL, TTS voice, sign out
    (tabs)/_layout.tsx       # custom tab bar: wiki · tasks · [Jarvis orb] · habits · captures
    (tabs)/index.tsx         # Jarvis home  → re-exports src/features/jarvis/JarvisScreen
    (tabs)/{wiki,tasks,habits,captures}.tsx   # thin re-exports of feature screens
    wiki/[pageId].tsx        # reader/editor stack screen → re-exports from features/wiki
  src/
    theme/                   # tokens.ts, tint.ts, ThemeProvider.tsx (shell lane)
    ui/                      # primitives (shell lane): AppText, Screen, Card, ListRow, Chip, PressableRow,
                             #   SectionHeader, EmptyState, Skeleton, Spinner, FAB, Sheet, ProgressBar
    lib/                     # ported auth/config: supabase.ts, auth-token.ts, settings.ts, server.ts,
                             #   deep-link.ts, dev-auth.ts, pair-link.ts (data lane; port mostly verbatim)
    api/                     # typed REST clients, deduped: device.ts (tasks/habits/captures/projects),
                             #   wiki.ts (single client, null-returning), jarvis.ts, sse.ts (data lane)
    data/                    # TanStack hooks (data lane): useTasks/useTaskMutations, useHabits/useHabitDay,
                             #   useCaptures, useWikiTree/useWikiPage, queryKeys.ts, invalidate.ts, realtime.ts
    features/
      jarvis/                # JarvisScreen + orb, composer, transcript list, tts queue, recorder (jarvis lane)
      tasks/                 # TasksScreen + rows, composer, detail sheet (tasks lane)
      habits/                # HabitsScreen + status ring, rows, editor sheet (habits lane)
      captures/              # CapturesScreen + composer, cards (captures lane)
      wiki/                  # WikiBrowse, Markdown reader, editor host + DOM bridge (wiki lane)
    widgets/                 # TasksWidget, HabitsWidget, CaptureWidget, sync.ts (widgets lane)
```

Path alias: `@/*` → `src/*` (tsconfig + babel already resolve via expo defaults; shell lane wires it).

Deleted at cleanup: `App.tsx`, `index.ts` (entry becomes `expo-router/entry`), `src/screens/*` (Today, Tasks, Captures, Habits, Training, Calendar, Search, More, Root, Home, Login, Wiki*), `src/components/*` except what features port in, `src/lib/use-collection.ts`, old `src/theme.ts`, `src/widgets/{TodayWidget,TalkWidget,NewTaskWidget}.tsx`.

## Design register (craft, from apps/web/app/globals.css)

Fonts: **Space Grotesk** 400/500/600/700 (all UI), **JetBrains Mono** 400/500 (numerics/micro-labels, tabular), **EB Garamond** 600 (logotype only). Serif beyond the logotype is banned.

Type ladder (px / line-height): display 30/1.2 (-0.02em), title 20/1.35 (-0.01em), subtitle 16/1.45, body 14.5/1.6, meta 13/1.5, micro 11.5/1.4.

Palette (light / dark):

| token | light | dark |
|---|---|---|
| canvas | `#f9f5f0` | `#15171a` |
| surface | `#f3f0eb` | `#1e2124` |
| surfaceRaised | `#ffffff` | `#272a2e` |
| ink | `#36302c` | `#d6d9dd` |
| inkMuted | `#78726d` | `#9da0a5` |
| inkFaint | `#98938f` | `#797c81` |
| edge | `#e5e3e1` | `#2c2f33` |
| edgeStrong | `#d8d5d2` | `#3a3d42` |
| hover | `#f0ede7` | `#232529` |
| selected | `#ebe7e0` | `#2b2e32` |
| accent | `#277c99` | `#62b8d8` |
| amber | `#cd9130` | `#d09945` |
| sage | `#639564` | `#70a971` |
| coral | `#d95b56` | `#e66e68` |
| violet | `#8c74cc` | `#9e88da` |
| blue | `#4682cc` | `#6098de` |

8-hue tint ramp (bg/edge/ink per scheme) — `tintFor(key)` hashes `hash*31+charCode >>> 0` onto `rose peach butter sage mint sky lavender plum`; folder colors stored as bare token names:

| hue | light bg/edge/ink | dark bg/edge/ink |
|---|---|---|
| rose | `#ffebec` `#ec8a92` `#923240` | `#382425` `#9e4b54` `#e9bec0` |
| peach | `#ffeee2` `#e79e6b` `#85491a` | `#36261c` `#9b5e30` `#e9c6af` |
| butter | `#fbf4da` `#d4bd67` `#6e580f` | `#2f2a17` `#857430` `#dbd1ad` |
| sage | `#e9f6e6` `#89bb7e` `#365e2d` | `#232e20` `#4f7945` `#bdd6b8` |
| mint | `#e0f7f1` `#63baa8` `#005e50` | `#1c2e2a` `#2c7b6c` `#acd9ce` |
| sky | `#e5f4fd` `#61afda` `#005a81` | `#1d2c35` `#31779b` `#b5d3e5` |
| lavender | `#efefff` `#9d9be7` `#504994` | `#282839` `#6c68a9` `#cacaee` |
| plum | `#faebf8` `#cf8ec9` `#793974` | `#332531` `#8f588a` `#e1c3de` |

Radii ladder: 6 (menu rows) · 8 (tiles, icon buttons) · 10 (buttons, inset sub-cards) · 12 (panels) · 14 (cards) · 20 (floating panels/sheets) · 9999 (pills, chips h-28px).

Shadows (RN approximation): card `{opacity 0.06, radius 10, offsetY 2}`, cardHover/float `{0.09, 22, 8}`, pop `{0.18, 44, 16}` — shadow color warm-black `rgb(50,40,25)` light / black dark. Use sparingly; hairline borders carry most structure.

Motion law: entrances opacity 0→1 + y 4→0 over 160–220ms ease-out-quart `cubic-bezier(.25,1,.5,1)`; collapses 200–320ms `cubic-bezier(.32,.72,0,1)`; micro color 120–150ms; press transform 100ms; success overshoot ~4% spring. Nothing under 100ms, nothing over 320ms. Animate opacity/transform only. Respect reduced motion (`useReducedMotion` from Reanimated).

Grammar rules: one colored element per card max; weight carries hierarchy, not size; sentence case, never uppercase; mono only for tabular numerics; dates/status are bare colored text, never chips; no gradient washes, no glow rings, no hover scales, no accent-filled rows.

## Semantics carried from web

- **Tasks**: status ladder `not started → up next → in progress → almost done → lesno` (done; toast "Lesno."). Inbox = `dueDate == null`. Overdue = dueDate < today && status != lesno (coral). Today = butter tint ink. Priority dot only for P1 (coral 6px). Completed tasks sink into a strikethrough cluster, they don't vanish.
- **Habits**: 4-rung ladder `not_started → in_progress → almost_done → done` cycling on tap (ring fill 0, ⅓, ⅔, 1); absence of row = not_started; only `done` counts for streaks; denominator = today's scheduled habits (`daysOfWeek[getDay()]`); local `YYYY-MM-DD` dates, client-decided.
- **Captures**: reverse-chrono; source glyph (Jarvis sparkle in accent vs manual pen); hashtags as faint text, not chips; relative mono timestamps.
- **Wiki**: pages have at most one folder; folder `color` is a palette token; unpainted folders tint via `tintFor(folder.id)`; `contentJson` (BlockNote) is source of truth with `content` markdown mirror; daily page keyed by `daily_date`.

## Lane ownership (no lane edits another lane's files)

| lane | owns |
|---|---|
| shell | `app/*` (all route files incl. placeholder re-exports), `src/theme/*`, `src/ui/*`, `package.json` main field, `tsconfig.json`, `app.json` |
| data | `src/lib/*`, `src/api/*`, `src/data/*` |
| tasks / habits / captures / wiki / jarvis | `src/features/<name>/*` only |
| widgets | `src/widgets/*`, `plugins/*` (app.json widget entries coordinated through shell) |

Commits: small and atomic per logical unit, explicit pathspecs, conventional prefixes (`feat(mobile): …`). Typecheck with `pnpm --filter mobile typecheck` before each commit.
