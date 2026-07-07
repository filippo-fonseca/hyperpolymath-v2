# U-13 · jarvis-ring — Fable pre-plan seed

> For the Opus executor building `apps/web/components/world/jarvis/{JarvisRing.tsx, JarvisRibbon.tsx, useJarvisWorld.ts}`.
> Every contract cited below was read from the live repo on 2026-07-06 (file:line cited). This memo REFINES `PLAN.md §6 U-13` (PLAN.md:478-496); where the two differ (noted inline), this memo wins.
> The one sentence this unit serves: **the world ring is a NEW presentation of the SAME agent** (PLAN §1.4, PLAN.md:16). You reuse `streamJarvis`, `POST /api/jarvis`, and `invalidateAfterJarvisAction` byte-for-byte. You invent zero agent API.

---

## 0. Ground truth — frozen contracts and the REAL 2D JARVIS you reuse

### 0.1 World contracts you CONSUME (never modify)

- **`worldEvents`** — module emitter with exactly five FROZEN event names. U-13 emits `"jarvis-action"`; its payload type is the REAL SSE action event, re-exported type-only:

```89:95:apps/web/components/world/data/diffing.ts
export type WorldEventMap = {
  "task-completed": TaskTransition;
  "capture-created": { captureId: string };
  chime: { kind: "glass-bell" | "cork-pop" | "two-note" };
  "jarvis-action": JarvisActionEvent;
  "boot-complete": void;
};
```

  (`JarvisActionEvent` is imported type-only at `diffing.ts:20` from `@/components/jarvis/jarvis-stream-client` — the world event and the 2D SSE event are the SAME type, by design.) Do NOT add event names; do NOT install mitt (`diffing.ts:86-88`).

- **`cameraBus.flyTo(pose, ms): Promise<void>`** and **`bootDone()`** — `camera/CameraRig.tsx:150-178` and `:142-147`. U-13 does NOT call `flyTo` (see §7.2 — post-action camera work belongs to U-16). You only need `bootDone()` transitively: the Cmd+K branch you add to `useWorldKeys` sits below its existing boot gate (`useWorldKeys.ts:36`), so summoning is boot-gated for free.

- **`focusStack`** — `camera/useFocusStack.ts:66-117`. U-13 pushes nothing in MVP (no "go to X" tool exists in the tool set — see `invalidate-after-action.ts:53-96` for the full tool-name inventory). Documented seam: if a future `navigate` tool lands, the world reaction is `focusStack.push(...)` (so Esc-walk stays truthful), never a raw `cameraBus.flyTo`.

- **`useWorldData()`** — `data/useWorldData.ts:29-38`. U-13 reads only `userId` from it. The provider proves the island sits inside the app's QueryProvider (`data/WorldDataProvider.tsx:23,68-88` runs `useQuery` against shared keys), so `useQueryClient()` works inside the Canvas.

- **Tokens & materials** — `STUDIOLO.jarvisCyan = "#5FD0FF"`, `parchment`, `emberAlarm`, `deepVellum` (`materials/tokens.ts:11-23`); `heroGlass(o)` + the dev-enforced ≤3 transmission registry (`materials/hologram.ts:198-240`); `FIREFLY_GEOMETRY` singleton (`materials/sharedGeometries.ts:47`) reused for the thinking motes. Do NOT edit these frozen files; ring torus geometry is owned locally by U-13 (§3.1).

- **Fonts** — `text/fonts.ts:18-19` exports `EB_GARAMOND_ITALIC = '/world/fonts/EBGaramond-Italic.ttf'`; the preloaded glyph set explicitly covers "Ribbon text from Jarvis SSE deltas" (`fonts.ts:27,30-36`). The italic SDF atlas is already warm before you render a single delta.

- **The canvas** — `frameloop="demand"`, camera `[0,1.6,6] fov:55` (`WorldCanvas.tsx:21-25`). Every frame you want, you demand (§9).

- **Mount slot** — `WorldScene.tsx:60-69` marks the Wave-3 slot: add `<JarvisRing />` as ONE line above `<PostFX/>` (PostFX must stay last).

### 0.2 The REAL 2D JARVIS integration you reuse VERBATIM

**SSE client** — `streamJarvis(payload, callbacks, signal?, voiceActive = false, sttDoneAt = null): Promise<void>` (`components/jarvis/jarvis-stream-client.ts:114-129`). It POSTs `"/api/jarvis"` (`:169-180`) with `fetch + ReadableStream + TextDecoderStream`, parses SSE frames split on `\n\n`, and dispatches events by name (`:232-277`): `turn-start`, `text` (delta), `queued`, `clarification`, `action`, `done`, `error`. It owns the 60 s idle-timeout guard, abort plumbing, and the 402 BYOK message. **You call this function. You do not fetch, you do not parse SSE, you do not add a route.**

**Request shape** — `JarvisRequest` (`jarvis-stream-client.ts:38-64`): `{ input, history, parsedDates?, parsedPriority?, slashCommand?, linkedProjectIds?, linkedHashtags?, linkedPeople? }`.

**Event payloads** (`jarvis-stream-client.ts:66-95`):

```66:76:apps/web/components/jarvis/jarvis-stream-client.ts
export interface JarvisActionEvent {
  toolUseId: string;
  name: string;
  result: {
    ok: boolean;
    id?: string;
    receipt?: Record<string, unknown>;
    error?: string;
    kind?: string;
  };
}
```

plus `JarvisQueuedEvent { toolUseId; name }` (`:78-81`), `JarvisClarificationEvent { toolUseId; question; options; suggestedAction }` (`:83-88`), `JarvisTurnStartEvent { turnId }` (`:93-95`), and the callback bag `JarvisCallbacks { onText, onAction, onQueued?, onClarification?, onTurnStart?, onDone, onError }` (`:97-112`).

**Post-action invalidation** — `invalidateAfterJarvisAction(qc, toolName, userId)` (`lib/jarvis/invalidate-after-action.ts:46-97`). Maps tool name → TanStack keys (`tasks`+`tasks_projects`+`projects`, `captures`+joins, calendar prefix, …) and invalidates immediately, independent of the best-effort Realtime echo. The 2D console calls it **once per action, only when `data.result?.ok`** (`components/jarvis/JarvisConsole.tsx:679-681`). Copy that gate exactly.

**The lite-caller precedent** — `GlobalJarvisHandler.tsx:173-182` shows the minimal legal request for a console-less caller (`history: []`, empty parse arrays); `:59-75` shows the fire-and-forget `persistTurn` wrapper around `saveJarvisTurn` (imported from `@/app/actions/jarvis-turns`, `:8`) so lite turns still join the `/today` conversation record (JarvisConsole live-merges them via its `jarvis_turns` Realtime channel, `JarvisConsole.tsx:258-323`).

**Payload builder** — `buildJarvisInputPayload(rawText, editorJson, userTimezone, slashCommandOverride)` (`components/jarvis/jarvis-input-payload.ts:149-218`) is PURE (no TipTap import at runtime; `SlashCommandKey` is type-only, `:32`). Passing `editorJson = null` gives you the full slash/hashtag/date/priority parse chain for a plain string. The world ribbon uses it (§6.1) so Kiwi's routing quality in the world equals the console — the core-value sentence must not be second-class in 3D.

**Clarification reply convention** — the console submits chip replies as `` `[CLARIFICATION REPLY] ${text}` `` (`JarvisConsole.tsx:1104-1113`). Reuse the prefix verbatim; the route detects it.

**Reply chime** — `streamJarvis` itself calls `playReply()` on `done` when `voiceActive` is false (`jarvis-stream-client.ts:270-274`). The world turn therefore already has a completion sound; U-13 emits NO `chime` world-event (glass-bell/cork-pop/two-note belong to U-09/provider/U-14).

### 0.3 The Cmd+K reality — THREE listeners, not two (read this twice)

The prompt-level model ("world capture-phase beats GlobalHotkeys' bubble-phase") is necessary but NOT sufficient. Ground truth:

1. **`GlobalHotkeys`** — bubble-phase `keydown` on window (`components/shell/GlobalHotkeys.tsx:126`); Cmd/Ctrl+K → `focusJarvis()` (`:33-37`). On `/world` this is a no-op anyway (`focusJarvis` fires a registered focus fn; only `JarvisInput` inside `JarvisConsole` on `/today` registers one — `lib/jarvis/focus.ts:52-62`), but our capture-phase `stopPropagation` kills it regardless. **No edit needed here.**
2. **`GlobalJarvisDialog`** — the Cmd+K command-palette dialog for every non-`/today` route, with its OWN **capture-phase** window listener:

```62:74:apps/web/components/jarvis/GlobalJarvisDialog.tsx
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey) return; // Cmd+Shift+K is reserved for CommandMenu.
      if (e.key !== "k" && e.key !== "K") return;
      if (pathname?.startsWith("/today")) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [pathname]);
```

   Both this and `useWorldKeys` listen capture-phase **on the same node (window)** — same-node/same-phase listeners fire in REGISTRATION order, and `stopPropagation()` does not stop them (only `stopImmediatePropagation()` would). The dialog mounts with the app layout, the world island mounts later via `dynamic({ssr:false})` → **the dialog's handler always runs first and `setOpen(true)` fires on `/world`.** The world cannot preempt it from its own listener.
3. **`useWorldKeys`** — the world's single capture-phase listener, which U-07 explicitly left as U-13's insertion point (`camera/useWorldKeys.ts:9-13`: "U-13 later adds its Cmd+K branch to THIS handler").

**Consequence (orchestrator-sanctioned amendment):** U-13 must make a ONE-LINE addition to `GlobalJarvisDialog.tsx` — a `/world` route guard mirroring its existing `/today` guard. This touches a 2D file beyond U-15's `GlobalHotkeys` allotment; it is a guard (2D routes byte-identical in behavior), it follows the file's own established pattern, and there is no world-side workaround. Flagged here per PLAN §9 contract-freeze rules; the orchestrator approves it by shipping this memo.

---

## 1. Architecture — the camera-space rig

### 1.1 One component in the scene, one hook, one Html root

```
WorldScene
└─ <JarvisRing/>                      ← the ONLY U-13 mount (one line at WorldScene.tsx:63)
   ├─ mounts useJarvisWorld() ONCE    ← state machine + streamJarvis wiring + jarvisWorldBus
   └─ createPortal(<group ref={rig}>  ← camera-space rig (§1.2)
        ├─ <mesh> outer torus         ← 1 draw call
        ├─ <mesh> inner torus         ← 1 draw call
        ├─ <ThinkingMotes/>           ← 1 InstancedMesh(FIREFLY_GEOMETRY, count 3); visible only while thinking
        └─ <JarvisRibbon handle=…/>   ← renders null when state === 'idle'
             ├─ <mesh planeGeom>{heroGlass({tint: parchment})}  ← 1 draw call (hero #2 of ≤3)
             ├─ <Text font={EB_GARAMOND_ITALIC} ref>            ← 1 draw call, imperative .text
             └─ <Html transform occlude="blending" distanceFactor={1.2}>
                  <input/> + clarification chips + error line   ← DOM, THE one <Html> root in the MVP scene
      </group>, camera)
```

Draw-call worst case: 5 (≤6 budget, PLAN §7.2 line PLAN.md:578). The ribbon's `heroGlass` consumes 1 of the ≤3 transmission budget (PLAN §7.7; enforced by `hologram.ts:198-217` — the focused-lantern swap is #1, one reserve remains).

### 1.2 Camera-space parenting (the "flies to your shoulder" mechanic)

VISION demands the ring "rests low in your peripheral vision" and "flies to center-view" when summoned (VISION.md:155-163). The honest implementation is a group parented to the CAMERA, so the familiar rides every glide for free (scene-graph transform, zero per-frame JS):

```tsx
const camera = useThree((s) => s.camera);
const scene = useThree((s) => s.scene);
useEffect(() => {
  scene.add(camera);              // R3F's default camera is NOT in the scene graph;
  return () => void scene.remove(camera);  // children need it there for matrixWorld
}, [camera, scene]);
return createPortal(<group ref={rigRef}>…</group>, camera);
```

(`createPortal` from `@react-three/fiber`.) Two frozen poses in CAMERA space (camera looks down −z):

```ts
const IDLE_POSE   = { position: [0.42, -0.28, -1.15] as const, scale: 0.7 };  // lower-right "shoulder"
const SUMMON_POSE = { position: [0.0,  -0.08, -0.9 ] as const, scale: 1.0 };  // center-view, reading distance
```

Sanity: fov 55 vertical ⇒ visible height at z=0.9 is `2·0.9·tan(27.5°) ≈ 0.94 m` — the 0.72 m ribbon spans ~half the view width at 16:10. At z=1.15 the idle ring (Ø0.28·0.7) is a quiet peripheral sigil. These numbers are the starting truth; ±15% feel-tuning is allowed, repositioning to world space is not.

Drei `<Html transform>` inside a camera-parented portal works: Html positions itself from the parent's `matrixWorld`, which the camera chain updates on every RENDERED frame — and under demand mode, whenever the camera moves, frames are already being rendered (U-07 §5.1), so the input never visibly detaches.

### 1.3 Files owned / touched

| File | Kind |
|---|---|
| `components/world/jarvis/JarvisRing.tsx` | NEW — rig, ring meshes, motes, breath, springs |
| `components/world/jarvis/JarvisRibbon.tsx` | NEW — glass, streamed Text, Html input, chips |
| `components/world/jarvis/useJarvisWorld.ts` | NEW — state machine, streamJarvis wiring, `jarvisWorldBus` |
| `components/world/camera/useWorldKeys.ts` | EDIT — the Cmd+K branch at the U-07-marked seam (§5.1) |
| `components/jarvis/GlobalJarvisDialog.tsx` | EDIT — one-line `/world` guard (§5.2, sanctioned amendment) |
| `components/world/WorldScene.tsx` | EDIT — one-line `<JarvisRing/>` mount |

`LightThread.tsx` is U-16's, NOT yours. Do not create it, do not stub it.

---

## 2. The state machine (`useJarvisWorld`)

```
       Cmd+K / jarvisWorldBus.summon()
idle ──────────────────────────────────▶ listening ── submit(input) ──▶ thinking
 ▲                                          ▲  ▲                          │ first onText
 │ dismiss() (Esc in input / Esc-equiv)     │  │ onDone                   ▼
 └──────────────────────────────────────────┘  └──────────────────── streaming
                                                onError(≠"aborted") ──▶ error ──(2.5 s or next keystroke)──▶ listening
```

- `state` is React `useState` — it changes at interaction/stream-STATUS cadence (a handful of times per turn), never per delta. Per-delta text lives in refs (§4.3). This is the §7.4 law applied to SSE.
- **`summon()`** — idempotent. If `state !== 'idle'`, just refocus the input. Else set `listening`; springs fly the rig `IDLE_POSE → SUMMON_POSE` and unroll the ribbon (`scaleX` 0→1, `config: { tension: 220, friction: 26 }` per PLAN §6 U-13); focus the input when the Html mounts (effect + `inputRef.current?.focus()`).
- **`dismiss()`** — abort any in-flight stream (`abortRef.current?.abort()` — `streamJarvis` then surfaces `onError("aborted")`, which you swallow silently, `jarvis-stream-client.ts:186-189`), clear clarification/error, set `idle`, springs return to `IDLE_POSE`, and `(document.activeElement as HTMLElement | null)?.blur()` so the NEXT keystroke's `e.target` is `<body>` and `useWorldKeys`' typing guard (`useWorldKeys.ts:41-50`) lets world keys through again. MVP decision: **Esc mid-stream aborts** (mirrors the 2D `jarvis-cancel` semantics, `JarvisConsole.tsx:997-1005`). A "ring keeps streaming at the shoulder" background mode is a post-MVP delight, not this unit.
- **`submit(input)`** — §6. Sets `thinking`, clears `replyBuffer`, fires `streamJarvis`.
- **`error`** — shows `errorMessage` in the Html error line + the ember-red edge flash (§3.3); auto-returns to `listening` after 2.5 s or on the next input keystroke, whichever first. `"aborted"` never enters this state.
- **`jarvisWorldBus`** — module-level `{ summon(): void; dismiss(): void }` published by the mounted hook (same publish-on-mount/null-on-unmount pattern as `controlsInstance` in `CameraRig.tsx:94-96,219-220`). It exists because `useWorldKeys` (a camera/ file) must reach the summon imperative without a React dependency; `worldEvents` is frozen at five names and may not grow one.

Import direction check: `camera/useWorldKeys.ts → jarvis/useJarvisWorld.ts` (bus only). `useJarvisWorld` imports nothing from `camera/` — no cycle.

---

## 3. The ring — geometry, material, per-state visuals

### 3.1 Geometry (module-level singletons in `JarvisRing.tsx` — do NOT touch the frozen `sharedGeometries.ts`)

```ts
const RING_OUTER_GEOMETRY = new THREE.TorusGeometry(0.14, 0.0045, 8, 64);
const RING_INNER_GEOMETRY = new THREE.TorusGeometry(0.095, 0.003, 8, 48);
```

Thin and precise — "an astronomer's instrument rather than a weapon core" (VISION.md:156-158). Both tori face the camera (default torus orientation in the camera-space rig already faces −z→viewer; no rotation needed). Thinking motes reuse `FIREFLY_GEOMETRY` (`sharedGeometries.ts:47`) in ONE `InstancedMesh` of count 3, orbit radius 0.05 inside the inner ring.

### 3.2 Material — bespoke additive-style `MeshBasicMaterial`, NOT `makeHologramMaterial` (justification)

```ts
function makeRingMaterial(baseIntensity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, toneMapped: false });
  m.color.set(STUDIOLO.jarvisCyan).multiplyScalar(baseIntensity); // HDR: >1 trips Bloom (threshold 1)
  return m;
}
// outer: baseIntensity 2.2 · inner: 1.6 · motes: 2.6  — three material instances, module-level, shared per mesh
```

Why not the hologram recipe: `makeHologramMaterial` (`hologram.ts:127-166`) is a LIT `MeshPhysicalMaterial` whose glow is a **fresnel rim** — bright at grazing angles, dark face-on. The ring is a thin pure emitter viewed face-on in camera space; fresnel would gut it exactly where it must burn. An unlit HDR `MeshBasicMaterial` is the cheapest program three has, blooms identically (`toneMapped:false` + luminance>1, the same trick the whole world uses), and adds zero shader-chunk surface. This is the "bespoke additive ring" branch of PLAN §6 U-13, chosen deliberately. Keep `depthWrite: true` (default) — the tori are opaque-enough light and must not blend-sort against the ribbon glass. Brightness changes mutate `material.color` via a damp toward a target scalar (the hover-convention pattern, `CameraRig.tsx:38-43`), never new materials.

### 3.3 Per-state visual grammar (exact numbers; executor may feel-tune ±20%)

| State | Ring | Motes | Ribbon |
|---|---|---|---|
| `idle` | shoulder pose; breath = 12 bpm (0.2 Hz) scale sine, amplitude 1.00→1.03, computed in `useFrame` from `clock.elapsedTime` — **frozen mid-breath when the world sleeps** (breath advances only on frames demanded by others; PLAN §6 U-13 idle policy, PLAN.md:481) | hidden (`visible=false`) | unmounted (null) |
| `listening` | center pose; outer intensity damps 2.2→3.0; breath continues (heartbeat active, §9.2) | hidden | open; input focused; caret blinking (DOM gives it free) |
| `thinking` | slow counter-rotation: outer `rotation.z += 0.15·dt`, inner `−0.22·dt` | visible; orbit `θᵢ = t·1.6 + i·2π/3`, y-bob `0.008·sin(t·2.4 + i)`; its `useFrame` calls `invalidate()` every frame — a sanctioned active runtime (PLAN §7.5(e)) | open; input disabled (`disabled={state!=='listening'}` mirrors the console's `disabled={streaming}`, `JarvisConsole.tsx:1262`) |
| `streaming` | rotation continues at half rate | hidden | ink writes on (§4) |
| `error` | intensity spikes to 3.4 then damps back | hidden | edge flash: a preallocated thin frame mesh (or the glass's tint) lerps `parchment → emberAlarm → parchment` over 600 ms; DOM error line shows `errorMessage` |

All per-frame motion mutates refs/materials in `useFrame`; the ONLY React state is the machine + clarification + errorMessage.

---

## 4. The ribbon — glass, DOM input, and the delta→SDF-text pipeline

### 4.1 The glass

`PlaneGeometry(0.72, 0.18)` (module singleton) + `heroGlass({ tint: STUDIOLO.parchment })` (`hologram.ts:238-240` — frozen transmission props, `tint` is your only knob). Local layout inside the rig group: ring at `x = −0.36` (the wax seal on the left, VISION.md:160-161), ribbon centered at `x = +0.06`. Unroll = spring `scale-x` 0→1 with origin at the ring: set the plane mesh's position so its LEFT edge sits at the ring, i.e. mesh at `x = +0.06`, and animate `scaleX` on a wrapper group positioned at `x = −0.30` with the plane offset `+0.36` inside it (scale-about-left-edge without geometry translation).

### 4.2 The input — drei `<Html>`, a REAL DOM `<input>` (the TECH hard rule)

PLAN §10 row 1 (PLAN.md:645): the ONLY in-world text entry is one drei `<Html>` DOM input — real caret, real IME. Exactly one `<Html>` root exists in the MVP scene and this is it (PLAN §6 U-13 perf constraints, PLAN.md:494).

```tsx
<Html transform occlude="blending" distanceFactor={1.2}
      position={[0.06, 0.045, 0.004]}   // upper band of the ribbon, in front of glass
      style={{ pointerEvents: "auto" }}>
  <input ref={inputRef} type="text" spellCheck={false}
         disabled={state !== "listening"}
         onKeyDown={onInputKeyDown}      // Enter → submit · Escape → dismiss
         style={{ /* Parchment on DeepVellum, EB Garamond via CSS (the (app) layout
                     already loads it via next/font), ~640px wide pre-transform,
                     transparent bg + 1px sepia bottom rule — a ruled journal line */ }}/>
  {clarification && <ChipRow …/>}        // §6.4 — same Html root, plain <button>s
  {state === "error" && <ErrorLine …/>}
</Html>
```

- **Enter** in the input → `submit(value)`; clear the input. **Escape** in the input → `dismiss()`. World keys never see either: with the input focused, `e.target` is the INPUT and `useWorldKeys`' typing guard stands down (`useWorldKeys.ts:38-50` — U-07 built this exact seam for you).
- Focus on summon: effect on `[state]` — when entering `listening`, `requestAnimationFrame(() => inputRef.current?.focus())` (the Html node mounts this commit; rAF beats the portal's layout).
- `occlude="blending"` is kept per PLAN §6 U-13 even though camera-space geometry rarely occludes — it's free and future-proofs Phase-3 forge overlaps.

### 4.3 Streaming ink — buffer + throttled troika flush (NO per-delta React)

The reply is ONE drei `<Text>` (`font={EB_GARAMOND_ITALIC}` from `text/fonts.ts:19`, `sdfGlyphSize={64}`, `fontSize={0.028}`, `color={STUDIOLO.parchment}`, `anchorX="left"`, `anchorY="top"`, `maxWidth={0.62}`, positioned `[−0.28, +0.01, 0.003]`, `clipRect={[0, -0.15, 0.62, 0]}` so overflow never bleeds off the glass). Its content is mutated IMPERATIVELY — the U-17 typewriter precedent (PLAN §6 U-17, PLAN.md:539: "ref + troika `text` property mutation + `sync()`"), never `setState` per delta:

```ts
// In useJarvisWorld — per-delta cost: one string concat + one integer bump. Zero React.
onText: (delta) => {
  replyBuffer.current += delta;
  replyVersion.current++;
  if (stateRef.current === "thinking") setState("streaming");  // once per turn
},

// In JarvisRibbon — flush at most every 50 ms, on demanded frames only:
useFrame(() => {
  if (flushedVersion.current === handle.replyVersion.current) return;
  const now = performance.now();
  if (now - lastFlushAt.current < 50) return;                   // PLAN §6 U-13's 50 ms throttle
  const mesh = textRef.current; if (!mesh) return;
  mesh.text = tail(handle.replyBuffer.current, 280);            // last ~280 chars; leading "…" when clipped
  mesh.sync(invalidate);                                        // render the new glyphs when layout lands
  flushedVersion.current = handle.replyVersion.current;
  lastFlushAt.current = now;
});
```

Demand-mode correctness: while the ribbon is open, the 10 fps heartbeat (§9.2) guarantees `useFrame` ticks, so pending deltas flush within ≤100 ms of arrival even when nothing else animates; `sync(invalidate)` demands the frame that actually shows the new text. `onDone` bumps `replyVersion` one final time so the tail always lands. The 280-char tail cap bounds troika re-layout cost on long replies (the full text stays in `replyBuffer` and, via persistence §6.5, in the `/today` scrollback — the ribbon is a teleprompter, not an archive).

**Why drei `<Text>` (troika) and not uikit — the decision, justified:** (a) the brand voice is italic EB Garamond SDF, and the exact `.ttf` + glyph set including "Ribbon text from Jarvis SSE deltas" is already committed and preloaded (`fonts.ts:18-36`) — uikit `Text` would need a separate MSDF font pipeline for Garamond Italic that does not exist in the repo; (b) troika's imperative `text`/`sync()` is the sanctioned per-frame-adjacent mutation path (U-17 precedent) — uikit prop churn per flush is precisely the "uikit 1.0.x allocation hotpath" risk PLAN §10 (PLAN.md:652) tells U-12 to avoid; (c) one `<Text>` = one draw call, no layout tree. uikit remains U-12's tool for the Today panel, where content changes at data cadence, not stream cadence.

---

## 5. Cmd+K summon/dismiss — the exact edits

### 5.1 `camera/useWorldKeys.ts` — the branch U-07 reserved for you

Insert AFTER the boot gate (`:36`) and BEFORE the typing guard (`:41`) — before the typing guard so Cmd+K still lands while the ribbon's own input is focused (idempotent summon → refocus), and before the modifier bail (`:54`) which would otherwise swallow it:

```ts
// U-13: Cmd/Ctrl+K — summon the ring. Capture phase (this listener) beats
// GlobalHotkeys' bubble-phase focusJarvis (GlobalHotkeys.tsx:33-37,126);
// GlobalJarvisDialog is route-guarded out on /world (GlobalJarvisDialog.tsx §5.2).
if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
  e.preventDefault();      // and the browser default (Firefox: Cmd+K = search bar)
  e.stopPropagation();     // kills the bubble-phase GlobalHotkeys handler
  jarvisWorldBus.summon();
  return;
}
```

Import: `import { jarvisWorldBus } from "../jarvis/useJarvisWorld";`. Nothing else in the file changes; the boot gate means Cmd+K during the Litany is inert (U-17's any-key skip still fires — it listens separately).

### 5.2 `components/jarvis/GlobalJarvisDialog.tsx` — the one-line guard (REQUIRED, see §0.3 for the proof)

```ts
      if (pathname?.startsWith("/today")) return;
      if (pathname?.startsWith("/world")) return; // U-13: the world owns Cmd+K (ring summon)
```

Without this, the dialog's earlier-registered capture-phase listener opens the 2D palette ON TOP of the summoning ring — `stopPropagation` cannot save you (same node, same phase, registration order). With it, on `/world` the dialog returns before `preventDefault`, your handler runs next in capture order, and the ring owns the key. On every 2D route the dialog is byte-identical. Commit this edit ALONE with a message citing this memo.

### 5.3 Dismiss and the focus round-trip

Esc-in-input → `dismiss()` (§2). After `blur()`, the next Esc reaches `useWorldKeys` (target is body) and pops the focus stack — Esc's two meanings never collide because they are separated by WHERE focus is, which is exactly U-07's design (`useWorldKeys.ts:38-40`). Acceptance drill: Cmd+K → type → Esc (ribbon folds) → Esc (camera pops a focus level).

---

## 6. streamJarvis wiring — payload, callbacks, invalidation, persistence

### 6.1 Building the request (`submit(input)`)

```ts
const p = buildJarvisInputPayload(
  input,
  null,                                                    // no TipTap doc in the world
  Intl.DateTimeFormat().resolvedOptions().timeZone,        // console gets a server-prop tz; world uses the browser's
  null,
);
if (p === null) return;                                    // empty input — no-op
const request: JarvisRequest = {
  input: p.input,
  history: historyRef.current,                             // §6.3
  parsedDates: p.parsedDates,
  parsedPriority: p.parsedPriority ?? undefined,
  slashCommand: p.slashCommand,
  linkedProjectIds: p.projectIds,
  linkedHashtags: p.hashtags,
  linkedPeople: p.people,
};
abortRef.current?.abort();                                 // abort-before-start, the console contract (JarvisConsole.tsx:536-538)
abortRef.current = new AbortController();
void streamJarvis(request, callbacks, abortRef.current.signal);  // voiceActive defaults false; sttDoneAt defaults null
```

Using the pure payload builder (not the `GlobalJarvisHandler` empty-arrays shape) means "email the prof Friday p1" carries the same chrono-parsed date + priority hints in the world as on the Page — SAME endpoint, SAME contract, SAME quality.

### 6.2 The callbacks table (exact, exhaustive)

| SSE event | Callback | World reaction |
|---|---|---|
| `turn-start` | `onTurnStart({turnId})` | store `turnId` in a ref (persistence correlation only); state already `thinking` |
| `text` | `onText(delta)` | `replyBuffer += delta; replyVersion++`; first delta flips `thinking → streaming` (§4.3) |
| `queued` | `onQueued(ev)` | no-op beyond the motes already orbiting (queued = tool acknowledged pre-executor; the console renders placeholder receipts, the ribbon has no receipt list) |
| `clarification` | `onClarification(ev)` | `setClarification(ev)` (React state, rare); §6.4 renders question + chips |
| `action` | `onAction(ev)` | **iff `ev.result?.ok`**: (1) `invalidateAfterJarvisAction(queryClient, ev.name, userId)` — the same call, same gate, as `JarvisConsole.tsx:679-681`; (2) `worldEvents.emit("jarvis-action", ev)` — typed against `WorldEventMap` (`diffing.ts:93`). Invalidate FIRST, then emit, so the refetch that will kindle the real ember is already in flight when U-16's choreography starts. If `!ok`: set a transient `errorMessage = ev.result.error` + 600 ms edge flash; do NOT emit (a light-thread to nowhere would lie — the same honesty rule as the differ's dropped completions, `diffing.ts:42-45`) |
| `done` | `onDone(usage)` | final `replyVersion++`; `setState("listening")`; append the turn to `historyRef` (§6.3); persist the assistant turn (§6.5); clear + refocus the input for the follow-up. (`playReply()` already chimed inside the client, `jarvis-stream-client.ts:270-274`.) |
| `error` | `onError(msg)` | `msg === "aborted"` → silent (dismissal path). Else `setState("error")`, `errorMessage = msg`, edge flash; persist the errored assistant turn; auto-return per §2. The 402 BYOK case arrives here pre-formatted (`jarvis-stream-client.ts:195-206`). |

### 6.3 Session history (the lite tier, deliberately)

`historyRef: { role: "user"|"assistant"; content: string }[]`, capped at the last 10 entries (the console's `HISTORY_TURN_LIMIT`, `JarvisConsole.tsx:167`). Push `{role:'user', content: p.input}` at submit and `{role:'assistant', content: replyBuffer.current}` at done. Plain strings only — NO `tool_use`/`tool_result` block reconstruction (that is console-grade machinery, `JarvisConsole.tsx:411-465`; `JarvisRequest.history` accepts plain strings by contract, `jarvis-stream-client.ts:44-52`). Trade-off accepted for MVP: follow-ups like "make it P1" work by title reference; exact-UUID cross-turn resolution stays a Page feature.

### 6.4 Clarification chips — in the SAME `<Html>` root (refinement over PLAN)

PLAN §6 U-13 sketched "option chips as uikit buttons" (PLAN.md:490-491); this memo overrides: chips are plain DOM `<button>`s rendered under the input INSIDE the one existing `<Html>` root. Rationale: real click targets with zero raycast plumbing, zero uikit font work, and the one-Html-root constraint stays trivially true. Each chip (and Enter on typed text while a clarification is pending) submits `` `[CLARIFICATION REPLY] ${option}` `` — the console's exact prefix (`JarvisConsole.tsx:1104-1113`) — then clears `clarification`. The question itself renders as ribbon ink: on `onClarification`, append `\n${ev.question}` to `replyBuffer` (version bump) so the SDF text shows it in the familiar's own hand.

### 6.5 Persistence — the world turn joins the ONE conversation

Mirror `GlobalJarvisHandler`'s fire-and-forget `persistTurn` (`GlobalJarvisHandler.tsx:59-75`): import `saveJarvisTurn` from `@/app/actions/jarvis-turns` and the `ScrollbackTurn`/`ScrollbackAction` types from `@/components/jarvis/jarvis-types` (type/action imports into the island are safe; the forbidden direction is world→2D bundles, `sharedGeometries.ts:15-19`). Persist the user turn at submit (`crypto.randomUUID()` id) and the assistant turn (accumulated `textDelta`, actions upgraded queued→done as events arrive, status done/error) at `onDone`/`onError`. JarvisConsole's `jarvis_turns` Realtime merge channel (`JarvisConsole.tsx:258-323`) then surfaces the world turn on `/today` automatically — one agent, one record, two theatres.

---

## 7. How completed actions surface in the world (the seams, precisely)

### 7.1 What U-13 does — narrate + signal

The data path needs nothing from you: `invalidateAfterJarvisAction` refetches `tableKey("tasks", userId)` etc.; `WorldDataProvider`'s differ sees the new row and the ember/firefly systems spring it in via the declarative slot arrays (`WorldDataProvider.tsx:107-138`). The choreography path needs exactly ONE thing from you: `worldEvents.emit("jarvis-action", ev)` per successful action (§6.2). That event is the frozen handshake.

### 7.2 What U-13 does NOT do

- **No `cameraBus.flyTo`, no light-thread, no firefly flight.** U-16 (`jarvis-routing-choreography`) subscribes to `"jarvis-action"`, resolves the receipt to a bough via `layout.byProject`, fires the thread + `fireflyBus.fly`, and performs the ≤20° camera assist (PLAN §6 U-16, PLAN.md:522-534). U-13 flying the camera would race it. Landing shots reuse `lanternFocusPose` (`CameraRig.tsx:131-140`) — U-16's import, not yours.
- **No `focusStack` pushes.** No navigate tool exists (§0.1). Leave the documented seam and move on.

The demo dependency is honest: with only U-13 merged, Cmd+K → sentence → ribbon streams → the new ember simply springs in via the differ (no flight yet). U-16 adds the climax on top of your event without touching your files.

---

## 8. Reduced-motion seam

Copy the named module function pattern from `CameraRig.tsx:114-123` (`prefersReducedMotion()` reading `matchMedia` at call time) — U-19 rewires that ONE function to `useWorldPrefs` later; keep the diff one line. Under reduced motion:

- Summon/dismiss/unroll springs: `immediate: true` (instant cuts — the ribbon appears, nothing glides).
- Breath amplitude → 0; ring rotation off; motes render as a static triad (`visible` only, no orbit `useFrame` demand loop).
- The 600 ms error flash → a static `emberAlarm` border on the DOM error line.
- Text streaming is UNCHANGED — streamed words are content, not motion.

---

## 9. Perf & idle discipline (PLAN §7 is law)

### 9.1 Budgets

- Draw calls ≤5 of the ≤6 allotment (§1.1); the Html input is DOM (zero); chips/error DOM (zero).
- ONE `<Html>` root in the entire scene — this one (PLAN.md:494,646).
- ONE transmission hero (`heroGlass` ribbon) — dev registry enforces the cap (`hologram.ts:198-217`); StrictMode double-mount is already handled there.
- Geometries/materials: module-level singletons; zero allocation in any `useFrame` (preallocated `Object3D`/scalar scratch for mote matrices).

### 9.2 The invalidation ledger for this unit (demand-mode, exact)

| Source | When | Mechanism |
|---|---|---|
| Summon/dismiss/unroll springs | transitions | `@react-spring/three` auto-invalidates (PLAN §7.5(a)) |
| Open-ribbon heartbeat | `state !== 'idle'` AND tab visible | `setInterval(invalidate, 100)` — the PLAN-sanctioned "10 fps demand heartbeat ONLY while ribbon open" (PLAN.md:481). Cleared on dismiss and on `document.visibilitychange → hidden` (re-armed on visible) |
| Thinking motes | `state === 'thinking'` | own `useFrame` calls `invalidate()` each frame — active runtime, terminates with the state (PLAN §7.5(e)) |
| Text flush | pending deltas | `mesh.sync(invalidate)` after each ≥50 ms flush (§4.3) |
| Ring brightness/flash damps | settling | `easing.damp` return value ORd into `invalidate()` — the U-07 hover convention (`CameraRig.tsx:38-43`) |
| `idle` | always | **NOTHING.** Breath is frozen mid-cycle; the ring costs zero rAF. The 4 s post-interaction window (other units) animates it incidentally — free liveliness, no demand of ours |

Acceptance: dismiss the ribbon, hands off 4 s → devtools shows zero rAF attributable to this unit (heartbeat cleared, motes unmounted-invisible, springs at rest).

### 9.3 React discipline

`state`/`clarification`/`errorMessage` are the ONLY React state; they change ≤ ~6 times per turn. Deltas: refs. Breath/rotation/orbit/flash: `useFrame` mutation. The input's value is uncontrolled DOM (read `inputRef.current.value` at submit) — zero re-render per keystroke.

---

## 10. Full TypeScript signatures (the frozen surface of U-13)

```ts
// ── jarvis/useJarvisWorld.ts ────────────────────────────────────────────────
import type {
  JarvisClarificationEvent,
} from "@/components/jarvis/jarvis-stream-client";

export type JarvisWorldState = "idle" | "listening" | "thinking" | "streaming" | "error";

export interface JarvisWorldHandle {
  state: JarvisWorldState;                          // React state — machine cadence only
  clarification: JarvisClarificationEvent | null;   // React state — rare
  errorMessage: string | null;                      // React state — rare
  replyBuffer: React.RefObject<string>;             // full streamed reply this turn (refs — read in useFrame)
  replyVersion: React.RefObject<number>;            // bumped per delta + once at done
  summon(): void;                                   // idempotent; refocuses input if already open
  dismiss(): void;                                  // aborts in-flight stream; blurs; returns to idle
  submit(input: string): void;                      // buildJarvisInputPayload → streamJarvis (§6)
  answerClarification(option: string): void;        // submits "[CLARIFICATION REPLY] …"
}

/** Mounted EXACTLY ONCE, by JarvisRing. Owns the machine, the stream, the bus. */
export function useJarvisWorld(): JarvisWorldHandle;

/** Module singleton for camera/useWorldKeys.ts (Cmd+K). Wired by the mounted
 *  hook; no-ops when the world is unmounted. NOT part of worldEvents (frozen). */
export const jarvisWorldBus: { summon(): void; dismiss(): void };

// ── jarvis/JarvisRing.tsx ───────────────────────────────────────────────────
/** The familiar: camera-space rig (createPortal into the camera), ring tori,
 *  breath, thinking motes, summon/dismiss springs. Mounts useJarvisWorld and
 *  renders <JarvisRibbon handle={…}/>. The ONLY U-13 mount in WorldScene. */
export function JarvisRing(): React.ReactElement;

// ── jarvis/JarvisRibbon.tsx ─────────────────────────────────────────────────
export interface JarvisRibbonProps { handle: JarvisWorldHandle; }
/** heroGlass ribbon + italic-Garamond streamed <Text> + THE one <Html> input.
 *  Returns null while handle.state === "idle". */
export function JarvisRibbon(props: JarvisRibbonProps): React.ReactElement | null;
```

Consumed (imports only, never modified): `streamJarvis`, `JarvisRequest`, `JarvisActionEvent`, `JarvisCallbacks`, `JarvisClarificationEvent` (`components/jarvis/jarvis-stream-client.ts`); `buildJarvisInputPayload` (`components/jarvis/jarvis-input-payload.ts`); `invalidateAfterJarvisAction` (`lib/jarvis/invalidate-after-action.ts`); `saveJarvisTurn` (`app/actions/jarvis-turns`) + `ScrollbackTurn`/`ScrollbackAction` types (`components/jarvis/jarvis-types`); `worldEvents` (`../data/diffing`); `useWorldData` (`../data/useWorldData`); `STUDIOLO` (`../materials/tokens`); `heroGlass` (`../materials/hologram`); `FIREFLY_GEOMETRY` (`../materials/sharedGeometries`); `EB_GARAMOND_ITALIC` (`../text/fonts`); `Html`, `Text` (`@react-three/drei`); `createPortal`, `useFrame`, `useThree` (`@react-three/fiber`); `useSpring`/`animated` (`@react-spring/three`); `easing` (`maath`); `useQueryClient` (`@tanstack/react-query`). PLAN §6 U-13's `useJarvisWorld` shape is refined (handle carries refs + clarification); this memo wins.

---

## 11. Ordered build checklist (commits per repo rule, explicit pathspecs)

1. **`useJarvisWorld.ts` — machine + bus, no stream yet.** State machine (§2), `jarvisWorldBus` publish/unpublish on mount/unmount, refs (`replyBuffer`, `replyVersion`, `historyRef`, `abortRef`). Pure logic; testable with a mocked stream.
2. **`useJarvisWorld.ts` — streamJarvis wiring.** `submit()` via `buildJarvisInputPayload` (§6.1), the full callback table (§6.2), abort-before-start, history push (§6.3), persistence (§6.5). *Commit 1: `components/world/jarvis/useJarvisWorld.ts`.*
3. **`JarvisRing.tsx` — rig + ring.** Camera portal + `scene.add(camera)` effect (§1.2), tori + materials (§3.1-3.2), IDLE/SUMMON pose springs, idle breath in `useFrame` (no demand), thinking motes (instanced, self-demanding while thinking), per-state damps (§3.3).
4. **`JarvisRibbon.tsx`.** Glass plane + `heroGlass` (unroll scale-about-left-edge, §4.1), `<Html>` input with focus/Enter/Escape handling (§4.2), streamed `<Text>` + the 50 ms flush `useFrame` (§4.3), clarification chips + error line (§6.4), error edge flash. *Commit 2: `JarvisRing.tsx` + `JarvisRibbon.tsx`.*
5. **Heartbeat + visibility gating** (§9.2) inside `JarvisRing` (armed on `state !== 'idle'`). Reduced-motion seam (§8).
6. **`useWorldKeys.ts` Cmd+K branch** (§5.1). *Commit 3: `components/world/camera/useWorldKeys.ts` alone.*
7. **`GlobalJarvisDialog.tsx` `/world` guard** (§5.2). *Commit 4: that file alone, message citing this memo §0.3.*
8. **`WorldScene.tsx` mount** — `<JarvisRing />` above `<PostFX/>` at the Wave-3 slot (`WorldScene.tsx:63`). *Commit 5.*
9. **Verification pass** — the acceptance list below, plus the §9.2 idle audit and a `gl.info.render.calls` delta check (≤5 with ribbon open + motes).

---

## 12. Acceptance (run all; PLAN §6 U-13 + §11 Jarvis checklist)

- [ ] **Cmd+K on `/world`** (post-Litany) summons: rig glides shoulder→center (springs), ribbon unrolls, DOM input has focus + a real caret. The 2D `GlobalJarvisDialog` does NOT open; on `/tasks` it still does (guard correctness both ways).
- [ ] **Cmd+K while the ribbon is open** refocuses the input (idempotent). Ctrl+1/2/3, Cmd+[ / Cmd+] on `/world` still perform their 2D actions (your branch matches only unmodified-except-meta/ctrl `k`).
- [ ] **A typed sentence streams**: motes orbit until the first delta, then italic Garamond ink writes onto the ribbon, flushes ≤100 ms behind the SSE deltas, no per-delta React render (React DevTools profiler: JarvisRibbon renders only on state changes).
- [ ] **`onAction` (ok)** fires `invalidateAfterJarvisAction` then `worldEvents.emit("jarvis-action", ev)` — verify with a console listener; the created task's ember springs in via the differ within one refetch. Failed action: red edge flash, NO emit.
- [ ] **Clarification**: question appears as ribbon ink; chips render in the Html root; clicking one submits with the `[CLARIFICATION REPLY]` prefix and the turn continues.
- [ ] **Esc in the input** dismisses (aborts mid-stream silently), rig returns to the shoulder; the NEXT Esc pops camera focus (world keys resumed). Typing guard verified: while the input is focused, `1–9` type digits, they don't fly the camera.
- [ ] **Persistence**: the world turn (user + assistant + action receipts) appears in the `/today` scrollback via the live-merge channel.
- [ ] **Idle discipline**: ribbon dismissed, hands off 4 s → zero rAF from this unit; ribbon open + idle hands → ~10 fps heartbeat only; tab hidden → heartbeat cleared.
- [ ] **Budgets**: ≤5 draw calls delta; exactly one `<Html>` root; heroGlass registry does not throw with the focused-lantern hero also live; ring/motes bloom (HDR>1) while the parchment ribbon glass does not.
- [ ] **Reduced motion** (macOS toggle): summon is an instant cut, no breath/orbit, text still streams.
- [ ] `tsc --noEmit` green; no new deps; zero three imports outside `components/world/**` introduced by your two 2D-file edits (both are plain TS/TSX guards).

*— Fable. Same agent, new body: reuse the stream, freeze the seams, let the ring only ever narrate what is true. Hand the torch to Opus.*
