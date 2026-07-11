# Studio v2 — "JARVIS Widget Canvas": floating dynamic widgets, in-app browser, voice summoning, reel-grade visuals

**Author:** Fable (Conductor). **Executor:** Codex `gpt-5.6-sol`, high reasoning.
**Branch:** `bgsd/studio-v2` (off `next`), worktree `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.claude/worktrees/studio-v2`. PR into `next` at the end (opened by the Conductor, never merged).
**Prime directive: ADDITIVE.** The existing Studio (R3F Studiolo room, 8 arc-zone hologram tiles, MediaPipe hand-grab pipeline, manipulation controller, focus overlay, HUD audio) is loved and stays. Do not delete, regress, or restyle the existing 3D tiles or the gesture pipeline. Everything here layers ON TOP.

**Inspiration (user-provided reel):** a JARVIS desktop assistant where saying "pull up a website" opens a live browser instance AS A WIDGET inside the assistant's own canvas — plus ambient widgets (news, markets, camera) as frameless floating glass panes that can be grabbed and dragged. Voice + gestures are the primary UX (dorm-room, hands-off); clicking is the always-working fallback. We keep OUR aesthetic (Studiolo palette, `components/studio/materials/tokens.ts`) and bring in HIS frame language: thin luminous edges, dark translucent glass, frameless floating panes over a deep atmospheric background.

**Read these before writing code:**
- `apps/web/components/studio/StudioLoader.tsx` (provider tree + z-stack of DOM siblings)
- `apps/web/components/studio/overlay/StudioFocusOverlay.tsx` (the DOM HoverProvider pattern + single-writer discipline)
- `apps/web/lib/studio/input/hub.ts` + `lib/studio/input/drivers/` (cursor + intent bus; how hand and mouse drivers emit grabStart/grabMove/grabEnd)
- `apps/web/components/studio/cloud/manipulation-controller.ts` (existing grab state machine — the 3D one; yours for DOM windows is a sibling, not a replacement)
- `apps/web/lib/studio/state/*.ts` (store pattern: framework-free stores + subscribe; follow it exactly)
- `apps/web/lib/studio/audio/synth.ts` + `cues.ts` (HUD cue synth — reuse, add cues, never new audio assets)
- `apps/web/components/studio/materials/tokens.ts` (Studiolo palette — the ONLY color source)
- `apps/web/lib/link-preview/fetch.ts` + `apps/web/lib/pages/link-embed.ts` (URL classification: youtube/twitter/generic — REUSE for the browser widget)
- `packages/jarvis-core/src/tool-names.ts` + `src/tools/` (tool pattern; read `read-whatsapp.ts`, `get-weather.ts`, `get-news.ts`)
- `apps/web/lib/jarvis/run-turn.ts` (how tools execute server-side and emit SSE actions)

**House rules:** no file > ~400 LOC (decompose); atomic work per slice; TypeScript strict; only Studiolo tokens (no raw hex in components — extend `tokens.ts` if a new value is genuinely needed); `prefers-reduced-motion` gated animation; respect the PerfGovernor (the DOM layer must not force per-frame React renders); Vitest for every new pure helper. No drizzle migrations (all data sources already exist).

---

## Slice A — Floating widget-window layer (the foundation)

A DOM layer of frameless glass widget windows floating OVER the 3D canvas, sibling to `StudioFocusOverlay` in `StudioLoader.tsx`. Windows are summonable, draggable (pointer AND hand), resizable, closable, persistent.

- A1. **Store** `lib/studio/state/widget-windows.ts` (follow the existing store pattern): instances `{ id, kind, props (per-kind, e.g. {url}), x, y (normalized 0..1 stage coords, center-anchored), w, h (normalized), z (stack order), createdAt }`. Mutations: `summonWidget(kind, props?, at?)`, `moveWidget`, `resizeWidget`, `focusWidget` (raise z), `closeWidget`, `closeAll`. Persist to localStorage (`studio:widget-windows:v1`), rehydrate on mount. Pure layout helpers (spawn-position picker that avoids stacking dead-center overlap, clamp-to-stage) in `lib/studio/windows/layout.ts` — unit-tested.
- A2. **Layer + frame** `components/studio/windows/WidgetWindowLayer.tsx` + `WidgetWindow.tsx`: absolutely-positioned panes inside the stage div. Frame = the reel language in our palette: dark translucent glass (`backdrop-blur`, deepVellum-tinted), 1px luminous border (brass at low alpha; jarvisCyan glow when focused/grabbed), rounded ~10px, soft outer shadow. Chrome: a slim top strip with an uppercase micro-label (widget kind), drag anywhere on the strip; hover/point reveals close (×) and pin controls; bottom-right resize handle. Entrance: 160–200ms scale(0.96→1)+fade, exit reverse — reduced-motion gated. Summon/dismiss/grab play new synth cues via the existing `cues.ts` (extend, volume matching current cues).
- A3. **Widget catalog** `lib/studio/windows/catalog.ts(x)`: registry mapping `kind → { label, icon, component (lazy), defaultSize, singleton? }`. Slices B/C register kinds here. Adding a future widget = one catalog entry + one component.
- A4. **Pointer interaction** (the click fallback, must be flawless): drag via pointer events on the frame (threshold ~4px so clicks inside content still work), resize via handle, focus-on-pointerdown raises z. All imperative via refs + store commits on release (no per-move React re-render of the layer; transform via style during drag).
- A5. **Hand-gesture integration**: register a HoverProvider on the input hub for window rects (priority ABOVE the 3D raycast provider so a window under the hand cursor wins). Pinch-drag on a hovered window = grab/move (phase bus grabStart/grabMove/grabEnd → imperative transform, commit on release); the existing 3D tile grabbing must keep working when the cursor is NOT over a window. Hand-hover shows the same focus glow. Fist-hold over a window = close (matching the existing collapse gesture semantics). Do not modify `gesture-core.ts` recognizers; consume their output.
- A6. **Summon menu** (click fallback for creation): a small HUD button (bottom cluster, next to the existing mute/row toggles, same chrome style) opening a compact menu of catalog widgets + a URL input row ("Pull up a website…"). Also `Cmd+K`-style keyboard affordance is NOT required — keep it to the button.
- A7. Z-stack discipline: windows layer sits above the canvas and below `StudioHandReticle` (z-35) and the HUD buttons (z-30) — pick a band (e.g. z-20..29 internally for window stacking) and document it in the layer file header. Focus overlay interplay: when the focus overlay (expanded tile) is open, windows stay visible but non-interactive OR dimmed — pick the simplest correct behavior and note it.

## Slice B — The in-app browser widget ("pull up a website")

- B1. Catalog kind `browser`, props `{ url }`, default size ~0.42×0.5 of stage. Component `components/studio/windows/widgets/BrowserWidget.tsx`: slim URL bar (mono, Studiolo chrome; Enter navigates, normalizes scheme to https), reload + "open ↗" (external, last resort) buttons, then the live view.
- B2. Live view routing via the EXISTING classifier (`lib/pages/link-embed.ts` / `lib/link-preview`): YouTube → `youtube-nocookie.com/embed/<id>` 16:9 iframe; Twitter/X → widget embed with bookmark fallback; everything else → sandboxed `<iframe>` (`sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`, `referrerPolicy="no-referrer"`).
- B3. Frame-refusal fallback: cross-origin load failures aren't directly observable — use a load-timeout heuristic (~4s without `onload`) plus a known-blocker list (google.com, x.com, instagram.com, facebook.com…, put in a pure helper, unit-tested). On refusal render a bookmark card (favicon, title, description via a new `app/api/studio/link-preview/route.ts` that wraps `lib/link-preview/fetch.ts` with getClaims auth — mirror the existing wiki `app/api/wiki/link-embed/route.ts`) with a prominent "open ↗". Loading state: skeleton shimmer in the glass pane. Never a broken white pane.
- B4. Multiple browser widgets allowed (not singleton).

## Slice C — Dynamic data widgets (WhatsApp · Weather · News)

Each is a catalog kind + component under `components/studio/windows/widgets/`, TanStack Query for data, content styled inside the glass pane (13px chrome, mono for stats, Studiolo ink colors). Data plumbing = thin API routes under `app/api/studio/` with `getClaims` auth, wrapping logic that ALREADY exists in `packages/jarvis-core/src/tools/` — extract shared logic rather than duplicating (if a tool's core is importable server-side, import it; otherwise lift the minimal query into a shared lib and have the tool + route both use it).

- C1. **WhatsApp** (`whatsapp`, singleton): recent chats grouped by contact with last message + time, unreplied highlighted (badge count in the header strip). Source: the Postgres `whatsapp_messages` table exactly as `read-whatsapp.ts` queries it. Realtime: subscribe to `postgres_changes` on `whatsapp_messages` → invalidate the query (same pattern as `StudioDataProvider`). Read-only (no send from the widget).
- C2. **Weather** (`weather`, singleton): current conditions + short forecast from the `get_weather` tool's data source via `app/api/studio/weather/route.ts`. Big mono temperature, condition line, small 3-slot forecast row. Refetch every 15min.
- C3. **News** (`news`, singleton): headlines from the `get_news` tool's source via `app/api/studio/news/route.ts`; list of ~6 headlines with source captions, click opens IN a browser widget (summon `browser` with the url — the flagship cross-widget move). Refetch every 30min.
- C4. All three registered in the catalog + summon menu with sensible default sizes/positions.

## Slice D — Voice summoning (the JARVIS moment)

Voice turns already run server-side (`lib/jarvis/run-turn.ts`) from the desktop wake pipeline and web. Widgets materialize via a realtime broadcast the Studio listens to.

- D1. **New jarvis-core tools** (follow the existing tool pattern, register in `tool-names.ts` + the tool registry): `studio_open_widget { kind: "browser"|"whatsapp"|"weather"|"news", url?: string }`, `studio_close_widget { kind?: string, all?: boolean }`. Tool descriptions must steer the agent: when the user says "pull up <site>/show me <thing> on screen/open a widget", prefer these over `open_url` (which launches an external browser). Execution: the tool handler publishes a message on a Supabase Realtime **broadcast** channel `studio:{userId}` (payload `{ type: "open_widget"|"close_widget", kind, url?, ts }`) and returns a success result ("Opened a browser widget for …"). No DB writes.
- D2. **Studio listener** `lib/studio/windows/voice-bridge.ts` + hook wired in `WidgetWindowLayer`: subscribes to `studio:{userId}` broadcast, applies actions to the widget-windows store (summon at the spawn-position picker, or close). Dedupe on `ts`. This makes BOTH paths work: desktop wake-word voice ("Daddy's home… pull up Hacker News") and any web-initiated turn.
- D3. **In-Studio push-to-talk** (so the dorm-room loop works without the desktop app): a small mic HUD button in the same bottom cluster — hold (or click-toggle) to record via `MediaRecorder`, POST to the existing `/api/jarvis/stt`, then run the transcript through the existing text-turn endpoint (`/api/jarvis` or `/api/jarvis/voice/text` — use whichever the web app already uses for text turns, with browser cookie auth). Show a minimal listening/thinking state on the button (jarvisCyan pulse). The reply text can surface as a transient caption strip at the bottom of the stage (auto-dismiss ~6s). Reduced-motion gated.
- D4. Guard: `studio_*` tools must be safe when no Studio is open (broadcast into the void is fine; the tool result copy should not overpromise).

## Slice E — Reel-grade visual upgrade (background + frames)

Elevate the room so the floating glass panes read like the reel — WITHOUT touching tile/gesture logic.

- E1. **Atmosphere**: deepen the background — a subtle radial depth gradient behind the room (deepVellum→nightwalnut), gentle volumetric-feel glow around the arc (cheap: a large soft emissive plane or sprite, NOT real volumetrics), slightly richer ember/firefly density ONLY at high perf tier (PerfGovernor-aware). Everything from `tokens.ts`.
- E2. **Frame language unification**: the widget-window frame (A2) is the canonical "pane" look; apply the same edge treatment (1px luminous border + focused glow) to the focus-overlay pane chrome so the 2D layers feel like one family. Do not restyle the 3D hologram tiles.
- E3. **Grid shimmer on summon**: when a widget materializes, a brief (≤240ms) radial glint at its spawn point (DOM, reduced-motion gated).
- E4. Both the dark stage and any light-content iframes must coexist without eye-searing: iframes get a subtle inset border so white pages read as framed content, not a hole in the scene.

## Verification (all slices — must pass before claiming done)

- `pnpm --filter web exec tsc --noEmit` clean; `pnpm --filter web build` green; `pnpm --filter jarvis-core build` (or its typecheck) green if the package has one.
- Vitest: new suites for `lib/studio/windows/layout.ts` (spawn position, clamp, z-order), the frame-refusal helper, and the voice-bridge action reducer (pure part). Existing studio/gesture tests stay green.
- Manual checklist to print in the final report: A1–A7 (summon via menu, pointer drag/resize/close, persistence across reload, hand-grab a window while 3D tile grab still works), B1–B3 (youtube/twitter/generic/refusal fallback matrix), C1–C3 render with live data, D1–D3 (tool → broadcast → widget appears; push-to-talk round trip), E1–E4.
- If the sandbox blocks git commits, leave changes staged-ready and print exact per-slice commit commands with explicit pathspecs (no `git add -p`, no `git add -A`; group shared files sensibly).

## Commit plan (one atomic commit per slice, in order)

1. `feat(studio): floating widget-window layer with pointer + hand-grab support`
2. `feat(studio): in-app browser widget with embed routing and refusal fallback`
3. `feat(studio): whatsapp, weather, and news live widgets`
4. `feat(studio,jarvis): voice-summoned widgets via studio tools + realtime bridge`
5. `style(studio): reel-grade atmosphere and unified pane frame language`
