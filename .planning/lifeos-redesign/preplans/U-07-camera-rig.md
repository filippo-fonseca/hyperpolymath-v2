# U-07 · camera-rig — Fable pre-plan seed

> For the Opus executor building `apps/web/components/world/camera/{CameraRig.tsx, useFocusStack.ts, useWorldKeys.ts}`.
> Every contract cited below was read from the live repo on 2026-07-06 (file:line cited). This memo REFINES `PLAN.md §6 U-07`; where the two differ (noted inline), this memo wins.
> This is the **feel** unit. The camera is the user's body. Every choice below serves one sentence: *guided flight, never free-look, never nausea* (PLAN §1.6).

---

## 0. Ground truth — what is already frozen, what you must implement

**Frozen contracts you CONSUME (do not redefine, do not modify):**

- `worldEvents` — the module-level emitter with exactly five event names, including `"boot-complete": void`:

```89:95:apps/web/components/world/data/diffing.ts
export type WorldEventMap = {
  "task-completed": TaskTransition;
  "capture-created": { captureId: string };
  chime: { kind: "glass-bell" | "cork-pop" | "two-note" };
  "jarvis-action": JarvisActionEvent;
  "boot-complete": void;
};
```

- `CameraPose` / `CameraBus` — the shapes you must IMPLEMENT. The interfaces live in the data-bridge; the runtime singleton lives in YOUR file (`camera/CameraRig.tsx`), typed against them:

```145:152:apps/web/components/world/data/diffing.ts
export interface CameraPose {
  position: Vector3Tuple;
  target: Vector3Tuple;
}

export interface CameraBus {
  flyTo(pose: CameraPose, ms?: number): Promise<void>;
}
```

  You write `export const cameraBus: CameraBus = { … }` in `CameraRig.tsx`, importing the interface: `import type { CameraBus, CameraPose } from "../data/diffing";`. U-16 (Jarvis routing) and U-15 (pose persistence) depend on this exact export name and shape.

- `TreeLayoutResult` / `BoughLayout` / `LanternLayout` (`data/treeLayout.ts:69-100`) — reached at render cadence via `useWorldData().layout` (`data/useWorldData.ts:17-38`). `layout.boughs` is already sorted by `orderIndex` asc then id (`treeLayout.ts:122-129, 182-186`) — **the array order IS the `1–9` key order**, no re-sort needed.

- `boughFocusPose(b: BoughLayout): { position: Vector3Tuple; target: Vector3Tuple }` — exported by U-06 from `tree/Boughs.tsx` (PLAN §6 U-06 signatures; being built in parallel this wave). Import it; do not reimplement bough pose math. Its return is structurally a `CameraPose`.

- `lanternPickMap: Map<number, string>` (U-10, `tree/Lanterns.tsx`) maps `instanceId → projectId`; U-10's click handler resolves the projectId and calls YOUR `focusStack` (convention in §2.6 below). Lantern world positions come from `layout.byProject.get(projectId)!.position`.

- The canvas: `frameloop="demand"`, camera seeded at `position:[0,1.6,6], fov:55` (`WorldCanvas.tsx:22-25`). Your `VESTIBULE_POSE.position` matches the canvas seed on purpose — first paint is already the vestibule; no mount flight.

**What you OWN:** the three files in `camera/`, the `cameraBus` singleton, the `focusStack` singleton, the single world keydown listener, and the hover-lift *convention* (documented here, implemented by each object family in its own `useFrame`).

**Versions (from `apps/web/package.json`):** `three@0.185.1`, `@react-three/fiber@9.6.1`, `@react-three/drei@10.7.7` (bundles `camera-controls` as its dependency — do NOT add `camera-controls` to package.json; import the impl type from the `camera-controls` package drei already provides), `maath@^0.10.8`.

---

## 1. `<CameraControls>` setup and the `cameraBus` fly pattern

### 1.1 Declarative mount (in `CameraRig.tsx`)

```tsx
import { CameraControls } from "@react-three/drei";
import type CameraControlsImpl from "camera-controls";

<CameraControls
  ref={controlsRef}
  makeDefault
  smoothTime={DEFAULT_SMOOTH_TIME}   // 0.35 — see §1.3 timing model
  draggingSmoothTime={0.12}          // snappy but damped manual orbit
  minDistance={1}
  maxDistance={14}                    // never orbit outside the r=14 floor disc (PLAN §6 U-08)
  minPolarAngle={0.15}                // never straight-down gimbal flip
  maxPolarAngle={Math.PI / 2 - 0.05}  // never below the floor plane
/>
```

- `makeDefault` registers the controls on R3F state so `useThree(s => s.controls)` works for U-15's pose persistence.
- drei forwards these props as instance properties onto the underlying `camera-controls` instance, so `smoothTime` etc. are live-tunable via the ref.
- **Disable truck/pan** after mount (guided flight — the user orbits and dollies, never strafes off into the void). In a mount effect on the ref:

```ts
const c = controlsRef.current!;
c.mouseButtons.right = CameraControlsImpl.ACTION.NONE;
c.mouseButtons.middle = CameraControlsImpl.ACTION.DOLLY;
c.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY;  // no two-finger truck
c.touches.three = CameraControlsImpl.ACTION.NONE;
```

  (`CameraControlsImpl` is the default export of `camera-controls`; `ACTION` is a static on the class. Import type + value: `import CameraControlsImpl from "camera-controls";` — this is a value import but resolves from drei's own dependency tree, adds ~0 bytes since drei already bundles it.)

- **Ref type:** `useRef<CameraControlsImpl | null>(null)`. The optional `controlsRef` prop (PLAN §6 U-07 `CameraRigProps`) is forwarded so U-15 can reach `getPosition/getTarget`; if the prop is absent, use the internal ref. Also publish the live instance to a **module-level** `let controlsInstance: CameraControlsImpl | null = null` in a mount effect (set on mount, null on unmount) — `cameraBus` is a module singleton and cannot read React refs.

### 1.2 The fly pattern — `setLookAt` with damped transition

The ONLY way the camera relocates is:

```ts
controls.setLookAt(px, py, pz, tx, ty, tz, /* enableTransition */ true);
```

`camera-controls` implements transitions as **SmoothDamp toward the new position/target** (not a fixed-duration tween). Two consequences you must design around:

1. **Duration is governed by `smoothTime`, not a `ms` argument.** `smoothTime` is the approximate time to close most of the gap; perceived arrival (visually at rest) is ~2× `smoothTime`. `smoothTime = 0.35` ⇒ a ~700 ms felt glide. This is the mapping for the `ms` parameter (§1.3).
2. **Every transition method returns a `Promise<void>` that resolves on the controls' next `rest` event** (camera-controls creates an internal on-rest promise for each transition call). This is the exact mechanism `cameraBus.flyTo` builds on — no manual `rest`/`sleep` listener bookkeeping, no `setTimeout` guessing.

### 1.3 `cameraBus` — exact implementation spec

Module-level in `CameraRig.tsx`:

```ts
const DEFAULT_SMOOTH_TIME = 0.35;          // ≈700 ms felt glide (PLAN's 600–900 ms window)
const SMOOTH_TIME_MIN = 0.3;               // ms=600 → 0.30
const SMOOTH_TIME_MAX = 0.45;              // ms=900 → 0.45
let flightSeq = 0;                          // monotonically increasing flight token

export const cameraBus: CameraBus = {
  async flyTo(pose: CameraPose, ms = 700): Promise<void> {
    const c = controlsInstance;
    if (c === null) return;                 // world unmounted mid-choreography: no-op, resolve
    const id = ++flightSeq;

    const smooth = !prefersReducedMotion(); // §5.3 — reduced motion ⇒ instant cut
    c.smoothTime = clamp(ms / 2000, SMOOTH_TIME_MIN, SMOOTH_TIME_MAX);
    try {
      const transition = c.setLookAt(
        pose.position[0], pose.position[1], pose.position[2],
        pose.target[0], pose.target[1], pose.target[2],
        smooth,
      );
      invalidateWorld();                    // one kick frame — §5.1 explains why this is safe+needed
      await Promise.race([transition, sleep(ms + 2000)]);  // failsafe: never deadlock U-16
    } finally {
      if (id === flightSeq) c.smoothTime = DEFAULT_SMOOTH_TIME;
    }
  },
};
```

Exact semantics, spelled out:

- **`ms → smoothTime` mapping:** `smoothTime = clamp(ms/2000, 0.30, 0.45)`. `ms=700` (default) ⇒ `0.35`. The divisor 2 encodes "felt duration ≈ 2× smoothTime". Callers outside 600–900 ms get clamped — the comfort window is law, not a suggestion.
- **Resolution:** the native camera-controls transition promise resolves on the next `rest` event (camera within `restThreshold` of target). We do NOT hand-roll `addEventListener('rest', …)` — the returned promise IS that listener.
- **Cancellation / interruption:** if a second `flyTo` (or a user drag — camera-controls treats user input as a new target) interrupts an in-flight glide, camera-controls simply redirects the damp; **both pending promises resolve at the single eventual `rest`.** `cameraBus` therefore guarantees: *every `flyTo` promise resolves (never rejects, never hangs); resolution means "the camera has settled", NOT "the camera reached MY pose".* Callers (U-16's camera assist, U-17's litany) must treat it as a settle signal. The `flightSeq` token exists only so the `finally` doesn't stomp a newer flight's `smoothTime`: an interrupted flight's `finally` sees `id !== flightSeq` and skips the restore; only the winning flight restores `DEFAULT_SMOOTH_TIME`.
- **Failsafe race:** `sleep(ms + 2000)` caps the wait. If a `rest` never fires (edge: controls disposed mid-flight during route change), choreography that `await`s `flyTo` still proceeds. The failsafe resolving does not cancel the transition — the damp just finishes on its own.
- **`invalidateWorld()`** is a module-level `let invalidate: () => void` captured from `useThree(s => s.invalidate)` in CameraRig's mount effect (same publish pattern as `controlsInstance`). One call demands one frame; the self-sustaining loop of §5.1 does the rest.
- **`prefersReducedMotion()`** = `typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches`, read at call time. U-19 later replaces this with `useWorldPrefs`; the seam is this one function — keep it a named module function so U-19's diff is one line.

### 1.4 Pose restore hook point (U-15 seam)

On mount, BEFORE the first demanded frame, check `sessionStorage["world:cameraPose"]`; if present, `setLookAt(..., false)` (instant, no transition). If absent, do nothing — the canvas camera seed (`[0,1.6,6]`) already equals `VESTIBULE_POSE.position`, and the mount effect should also do an instant `setLookAt(...VESTIBULE_POSE, false)` to fix the TARGET at `[0,2.2,0]` (the canvas seed only sets position; the default target is origin `[0,0,0]`, which aims the horizon too low). U-15 owns the save side; you own restore-on-mount.

---

## 2. `useFocusStack` — the focus chain

### 2.1 The insight: the stack is a chain, not a free stack

`FocusLevel` (PLAN §6 U-07, frozen):

```ts
export type FocusLevel =
  | { kind: "vestibule" }
  | { kind: "bough"; areaId: string }
  | { kind: "lantern"; projectId: string };
```

Valid stacks are ONLY prefix chains of `vestibule → bough → lantern`. Define `rank(f)`: vestibule=0, bough=1, lantern=2. The invariant: `stack[0]` is always `{kind:'vestibule'}`; ranks strictly increase along the stack. This collapses all edge cases:

- **`push(f)`:** truncate the stack to entries with `rank < rank(f)`, then append `f`. So pushing a bough while focused on another bough *replaces* it (`[V, boughA] → [V, boughB]`, one glide, no phantom depth); pushing a bough while on a lantern truncates to `[V, boughB]`; pushing the SAME level as current top (deep-equal) is a **no-op** (no re-glide on double-click).
- **`pop()`:** remove the top unless it is the vestibule base (pop at vestibule = no-op). Esc×3 from any depth is therefore always safe: lantern→bough→vestibule→noop.
- **`reset()`:** stack = `[{kind:'vestibule'}]`.

### 2.2 Where state lives: a module-level store, not React state in CameraRig

U-10 needs `focus.kind === 'lantern'` for its hero-glass swap (PLAN §6 U-10), and U-10's/U-06's click handlers live in *their* files. So the stack must be reachable both imperatively (mesh `onClick`) and reactively (CameraRig, Lanterns). Use the same pattern as `worldEvents`: a module singleton + `useSyncExternalStore`.

```ts
// camera/useFocusStack.ts — module scope
let stack: FocusLevel[] = [{ kind: "vestibule" }];
const subs = new Set<() => void>();
function notify() { for (const fn of Array.from(subs)) fn(); }

export const focusStack = {
  current(): FocusLevel { return stack[stack.length - 1]!; },
  push(f: FocusLevel): void { /* chain-truncate per §2.1; if changed, replace `stack` (new array identity) + notify() */ },
  pop(): void { /* no-op at vestibule; else slice + notify() */ },
  reset(): void { /* [{kind:'vestibule'}] + notify() — no-op if already there */ },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => subs.delete(fn); },
};

export function useFocusStack(): {
  current: FocusLevel; push(f: FocusLevel): void; pop(): void; reset(): void;
} {
  const current = useSyncExternalStore(focusStack.subscribe, focusStack.current, focusStack.current);
  return { current, push: focusStack.push, pop: focusStack.pop, reset: focusStack.reset };
}
```

- State changes at **interaction cadence** (clicks, keys), never per-frame — this respects §7.4 despite being "React state" at the consumer.
- `stack` mutations always create a new array; `current()` must return a **stable reference** when nothing changed (return the same top object) so `useSyncExternalStore` doesn't loop.
- Two synchronous pushes (the lantern convention, §2.6) fire two `notify()`s inside one event handler; React 19 batches them → CameraRig re-renders once → **one flight**, straight to the lantern. Document this in a comment; it is load-bearing.
- **`getServerSnapshot`** (third arg) returns the same `current` — the file is inside the `ssr:false` island, but `useSyncExternalStore` demands it.

### 2.3 CameraRig reacts to focus, and is the ONLY flight authority

CameraRig owns the single `focus → pose → flyTo` translation. Nobody else calls `flyTo` for focus reasons (U-16/U-17 may call `cameraBus.flyTo` for choreography, but never mutate focus without meaning it).

```ts
const { current } = useFocusStack();
const { layout } = useWorldData();

useEffect(() => {
  if (!bootDone()) return;                        // §3.4 gate
  if (isInitialMount) return;                     // vestibule at mount = already there (§1.4)
  const pose = poseForFocus(current, layout);
  if (pose === null) { focusStack.reset(); return; }  // stale focus (area/project deleted via Realtime)
  void cameraBus.flyTo(pose, 700);
}, [current, layout]);
```

`poseForFocus(f, layout): CameraPose | null`:

- `vestibule` → `VESTIBULE_POSE`.
- `bough` → `const b = layout.byArea.get(f.areaId); return b ? boughFocusPose(b) : null;` (import `boughFocusPose` from `../tree/Boughs` — U-06's frozen export).
- `lantern` → `const l = layout.byProject.get(f.projectId); return l ? lanternFocusPose(l) : null;`

Note the effect also depends on `layout`: if the focused bough MOVES (area re-order → new azimuth), the camera re-glides to the new pose. Rare, correct, and free.

### 2.4 `VESTIBULE_POSE` (frozen constant, exported from `CameraRig.tsx`)

```ts
export const VESTIBULE_POSE: CameraPose = {
  position: [0, 1.6, 6],   // matches WorldCanvas.tsx:25 camera seed exactly
  target: [0, 2.2, 0],     // eye-line drifts up the trunk toward the bough crown
};
```

(PLAN §6 U-07: `[0,1.6,6]→[0,2.2,0]`. Verified against `treeLayout.ts`: bough roots at `BOUGH_ROOT_Y = 1.7`, so target y=2.2 frames roots-to-crown from a standing 1.6 m eye height.)

### 2.5 `lanternFocusPose` — the reading-distance offset math

Lantern positions come from `layout.byProject.get(projectId)!.position` (`treeLayout.ts:247-251` — already includes the `LANTERN_HANG` drop and horizontal jitter). The camera should sit slightly **outside** the lantern (radially away from the trunk) looking back at it — the trunk and other boughs stay in frame behind, so the user never loses the room:

```ts
const READING_DIST = 1.2;   // m from lantern center — close enough to read a caption, far enough for no scale shock
const READING_LIFT = 0.25;  // m above the lantern — slight downward gaze, most comfortable pitch

export function lanternFocusPose(l: LanternLayout): CameraPose {
  const [px, py, pz] = l.position;
  const h = Math.hypot(px, pz);                       // horizontal distance from trunk axis
  const ux = h > 1e-4 ? px / h : 0;                   // outward radial unit vector (XZ)
  const uz = h > 1e-4 ? pz / h : 1;                   // degenerate lantern-on-axis → face +z
  return {
    position: [px + READING_DIST * ux, py + READING_LIFT, pz + READING_DIST * uz],
    target: [px, py, pz],
  };
}
```

Export it — U-10's hero swap and U-16's landing shots may reuse it.

### 2.6 Click conventions (documented for U-06/U-10; enforce via code review, not code)

- **Bough mesh** (`userData = { kind:'bough', areaId }`, U-06): `onClick={(e) => { e.stopPropagation(); focusStack.push({ kind:'bough', areaId }); }}`.
- **Lantern instance** (U-10, via `lanternPickMap.get(e.instanceId)`): push the PARENT CHAIN in one handler so pop() walks lantern→bough→vestibule even when the user deep-clicked from the vestibule:

```ts
const l = layout.byProject.get(projectId);
if (l) {
  focusStack.push({ kind: "bough", areaId: l.areaId });   // no-op if already there (§2.1 dedupe)
  focusStack.push({ kind: "lantern", projectId });
}
```

- `e.stopPropagation()` on every pickable so a lantern click doesn't also fire its bough's handler ray-through.
- Clicking empty space does nothing in MVP (no pop-on-miss — Esc is the way back; accidental background clicks must not yank the camera).

---

## 3. `useWorldKeys` — the single keyboard listener

### 3.1 Registration

One `window.addEventListener("keydown", handler, { capture: true })` in a `useEffect` mounted ONCE by `CameraRig` (call `useWorldKeys()` inside `CameraRig`; the hook returns nothing). **Capture phase is deliberate:** `GlobalHotkeys` listens in the bubble phase on window (`GlobalHotkeys.tsx:126`), and U-13 must intercept Cmd+K on `/world` *before* `GlobalHotkeys.focusJarvis()` runs (PLAN §6 U-13 integration notes). Registering the world's listener in capture phase now means U-13 later adds its Cmd+K branch to THIS handler instead of racing a second listener. Cleanup removes with the same `{ capture: true }` flag.

Keep the handler's data dependencies in refs so the listener registers exactly once:

```ts
const layoutRef = useRef(layout);
layoutRef.current = layout;   // updated every render, read inside the stable handler
```

(Re-subscribing on every layout change is the failure mode that produces double-firing listeners; the ref pattern eliminates it. This is the "single keydown listener" perf constraint from PLAN §6 U-07, verified in acceptance.)

### 3.2 The typing guard — copied from `GlobalHotkeys.tsx`

Copy this guard verbatim (source: `apps/web/components/shell/GlobalHotkeys.tsx:89-98`) as the FIRST check in the handler:

```89:98:apps/web/components/shell/GlobalHotkeys.tsx
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
```

This single guard also solves the future Esc-vs-Jarvis-ribbon conflict for free: when the ribbon's DOM `<input>` (U-13's drei `<Html>`) has focus, `e.target` is that INPUT and world keys stand down — Esc reaches the ribbon's own dismiss handler instead of popping focus.

### 3.3 Key map (exact, exhaustive for U-07)

Processed in this order, after the typing guard:

| Condition | Action |
|---|---|
| any of `e.metaKey / e.ctrlKey / e.altKey` held | `return` — never fight `GlobalHotkeys`' Ctrl+1/2/3 tab-swap (`GlobalHotkeys.tsx:83-86`), Cmd+[ / Cmd+], browser combos. Plain unmodified keys only. (Allow bare `shiftKey` through — harmless.) |
| `e.key === "Escape"` | `e.preventDefault(); focusStack.pop();` (CameraRig's focus effect performs the glide) |
| `e.key` in `"1"…"9"` | `const i = Number(e.key) - 1; const b = layoutRef.current.boughs[i]; if (b) { e.preventDefault(); focusStack.push({ kind: "bough", areaId: b.areaId }); }` — out-of-range digits fall through untouched |
| anything else | fall through (do NOT `preventDefault` — U-17's any-key litany-skip listens separately) |

`layout.boughs` is already in `orderIndex` order (`treeLayout.ts:182-186`), so key `3` = third area in the sidebar, matching the 2D mental map (PLAN §6 mapping table: `orderIndex` → "key 1–9 order").

### 3.4 The `boot-complete` gate

The world ignores ALL navigation input until the Litany finishes (PLAN §6 U-17: "gates interactivity: CameraRig ignores input until then").

```ts
// module scope in CameraRig.tsx (single source of truth for the gate)
let _bootDone = false;
export function bootDone(): boolean { return _bootDone; }
```

- In CameraRig's mount effect: `const off = worldEvents.on("boot-complete", () => { _bootDone = true; });` (unsubscribe on unmount; do NOT reset `_bootDone` to false on unmount — same-session revisits skip the litany per PLAN §6 U-17, and the flag mirrors that).
- **Failsafe:** the litany is 6 s; if `boot-complete` hasn't fired **8 s** after CameraRig mounts, set `_bootDone = true` and `console.warn` in dev. Rationale: U-17 is a wave-4 unit — during wave-2/3 development NOTHING emits `boot-complete`, and without the failsafe the world is permanently deaf. The failsafe makes U-07 testable standalone AND armors production against a lost event. Clear the timeout on unmount and on the event.
- Enforcement points (both): first line of the keydown handler (`if (!bootDone()) return;`) and the focus-flight effect (§2.3). `cameraBus.flyTo` itself is NOT gated — the litany (U-17) and choreography (U-16) legitimately fly the camera programmatically.
- Clicks during boot: bough/lantern `onClick` pushes focus, but the gated flight effect ignores it. To avoid a stale post-boot jump, the `boot-complete` subscription also calls `focusStack.reset()` (silently, before the flag flips ordering matters: reset first, then `_bootDone = true`) so the world always wakes at the vestibule.

---

## 4. Hover — the convention U-07 defines, object families implement

### 4.1 The pattern (ref-based, zero React state, per-object `useFrame`)

Hover is each object family's job (U-06 boughs, U-10 lanterns, U-09 embers); U-07 defines the ONE sanctioned pattern so every family feels identical. **No shared hover bus is needed for MVP** — hover state never crosses component boundaries except to U-11's caption singleton, which subscribes to pointer events on its own. Do not build a bus speculatively; document the pattern instead (this section IS the convention — copy it into a comment block at the top of `CameraRig.tsx`).

```tsx
// THE HOVER CONVENTION (U-07). Per hoverable object/instance:
const hoverTarget = useRef(0);            // 0 = rest, 1 = hovered — a TARGET, not an animation
const invalidate = useThree((s) => s.invalidate);

<mesh
  onPointerOver={(e) => { e.stopPropagation(); hoverTarget.current = 1; invalidate(); }}
  onPointerOut={() => { hoverTarget.current = 0; invalidate(); }}
/>

useFrame((_, delta) => {
  const mat = matRef.current;
  const goal = BASE_EMISSIVE + EMISSIVE_LIFT * hoverTarget.current;   // e.g. 0.9 → 1.5
  const moving = easing.damp(mat, "emissiveIntensity", goal, 0.1, delta);  // maath/easing
  if (moving) invalidate();               // keep demanding frames ONLY while settling
});
```

Rules, exactly:

1. **`hoverTarget` is a ref holding a goal**, mutated in the pointer handlers. NEVER `useState` — a hover must not re-render anything (PLAN §7.4: zero per-frame React state; hover changes many times per second while browsing).
2. **`maath`'s `easing.damp(object, key, goal, smoothTime, delta)`** runs in the object's OWN `useFrame`. `smoothTime = 0.1` ⇒ visible lift within ~100 ms (the acceptance number). `damp` returns `true` while still moving — feed that straight into `invalidate()` so the settle animation self-sustains under `frameloop="demand"` and stops demanding the moment it converges (built-in epsilon).
3. **Both pointer handlers call `invalidate()` once.** Under demand mode R3F raycasts pointer events against the last rendered frame without rendering new ones — the handler fires fine, but nothing would repaint. The single `invalidate()` kicks the damp loop. This is invalidation-ledger item (d) (PLAN §7.5).
4. **Cursor affordance:** drei's `useCursor(hovered)` needs a boolean state — instead set `document.body.style.cursor` directly in the same handlers (`"pointer"` / `""`), keeping the no-React-state rule intact.
5. **Hover lean** (lanterns tilt 2–3°, PLAN §6 U-10): same pattern, second damp — `easing.dampE(group.rotation, [0, 0, leanRad * hoverTarget.current], 0.12, delta)` — OR'd into the same `moving` flag.
6. Instanced families (embers U-09, lanterns U-10) key the target by `e.instanceId`: a preallocated `Float32Array` of targets, damped per-instance in the family's single `useFrame`. Same convention, vectorized.

---

## 5. Perf & idle discipline (PLAN §7 is law)

### 5.1 How frames flow during a glide (verify, don't assume)

Demand-mode invalidation ledger (PLAN §7.5): camera motion is item **(b) — "camera-controls change events during glides/orbits."** The mechanism in drei 10.7.7: the `<CameraControls>` component runs `controls.update(delta)` inside its own `useFrame`, and listens to the instance's `update`/`control` events, calling `invalidate()` on each. So each rendered frame in which the damp moved fires `update` → demands the NEXT frame → self-sustaining loop that **terminates automatically at `rest`**. The chicken-and-egg (no frame → no `update()` call → no event → no frame) is broken by the single `invalidateWorld()` kick inside `flyTo` (§1.3) and by the pointer/keyboard handlers. **Verification step (build checklist item 8):** with the world idle, call `cameraBus.flyTo(...)` from the console and confirm via devtools Performance panel that rAF activity starts, sustains ~60 fps for ~700 ms, and goes to ZERO after rest. If drei's wiring ever fails to sustain (version drift), the sanctioned fallback is an explicit `rest`-await loop — but test first; do not preemptively add a second invalidation source.

### 5.2 The rules this unit must obey

- **No per-frame React state anywhere** — focus changes at interaction cadence (§2.2); hover lives in refs (§4); `cameraBus` is promise-based, not state-based.
- **Single keydown listener** (§3.1, ref-pattern so it never re-registers).
- **CameraRig renders `<CameraControls/>` and nothing else visible** — it is a logic component; zero draw calls, zero geometry.
- **Idle = truly asleep:** after any glide settles and hover damps converge, NOTHING in this unit demands frames. No `useFrame` in CameraRig itself, no polling, no heartbeat (the firefly heartbeat is U-14's, item (f); the 4 s post-interaction breath window is U-06/U-08's, item (g)). Acceptance: devtools shows zero rAF after 4 s hands-off (PLAN §6 U-07 acceptance; §7.10 idle audit).
- `smoothTime` mutations in `flyTo` are plain property writes — no allocation, no re-render.

### 5.3 Reduced-motion seam (U-19 lands it; you leave the socket)

`prefersReducedMotion()` (§1.3) is the single function U-19 rewires to `useWorldPrefs`. Under reduced motion every `flyTo` becomes `setLookAt(..., false)` — an instant cut, which camera-controls still resolves promptly (PLAN §6 U-19: "CameraRig `setLookAt(..., false)` instant cuts"). Keys/Esc/focus semantics are unchanged.

---

## 6. Full TypeScript signatures (the frozen surface of U-07)

```ts
// ── camera/useFocusStack.ts ─────────────────────────────────────────────────
export type FocusLevel =
  | { kind: "vestibule" }
  | { kind: "bough"; areaId: string }
  | { kind: "lantern"; projectId: string };

/** Imperative singleton — for mesh onClick handlers in U-06/U-10. */
export const focusStack: {
  current(): FocusLevel;
  push(f: FocusLevel): void;   // chain-truncate semantics (§2.1); deep-equal top = no-op
  pop(): void;                 // no-op at vestibule
  reset(): void;
  subscribe(fn: () => void): () => void;
};

/** Reactive consumer — CameraRig, U-10 hero swap. PLAN §6 U-07 shape, verbatim. */
export function useFocusStack(): {
  current: FocusLevel;
  push(f: FocusLevel): void;
  pop(): void;
  reset(): void;
};

// ── camera/CameraRig.tsx ────────────────────────────────────────────────────
import type { CameraBus, CameraPose } from "../data/diffing";   // frozen shapes (diffing.ts:145-152)
import type CameraControlsImpl from "camera-controls";
import type { LanternLayout } from "../data/treeLayout";

export const VESTIBULE_POSE: CameraPose;   // { position:[0,1.6,6], target:[0,2.2,0] }

/** THE cameraBus (PLAN §9 contract-freeze table). Implements CameraBus from data/diffing.ts. */
export const cameraBus: CameraBus;         // flyTo(pose, ms = 700): Promise<void> — §1.3 semantics

/** Reading-distance pose for a lantern (§2.5). Reused by U-10 hero swap / U-16. */
export function lanternFocusPose(l: LanternLayout): CameraPose;

/** True once worldEvents 'boot-complete' fired (or the 8 s failsafe elapsed). */
export function bootDone(): boolean;

interface CameraRigProps { controlsRef?: React.RefObject<CameraControlsImpl | null>; }
export function CameraRig(props?: CameraRigProps): React.ReactElement;

// ── camera/useWorldKeys.ts ──────────────────────────────────────────────────
/** Mounted exactly once, by CameraRig. Registers the single capture-phase keydown listener. */
export function useWorldKeys(): void;
```

Consumed (imports only, never modified): `worldEvents`, `CameraBus`, `CameraPose` (`data/diffing.ts`); `useWorldData` (`data/useWorldData.ts`); `BoughLayout`, `LanternLayout`, `TreeLayoutResult` types (`data/treeLayout.ts`); `boughFocusPose` (`tree/Boughs.tsx`, U-06); `easing` from `maath`; `CameraControls` from `@react-three/drei`; `CameraControlsImpl` (default export of `camera-controls`).

---

## 7. Ordered build checklist

1. **`useFocusStack.ts`** — the module store + hook (§2.1–2.2). Pure TS, no three imports. Unit-testable immediately: chain-truncate push, no-op pop at base, dedupe, subscriber notification.
2. **`CameraRig.tsx` skeleton** — `<CameraControls makeDefault smoothTime={0.35} …/>` with the §1.1 props, mount effect publishing `controlsInstance` + `invalidateWorld`, truck disabled, instant `setLookAt(...VESTIBULE_POSE, false)` on mount (target fix, §1.4), sessionStorage pose-restore branch.
3. **`cameraBus`** — §1.3 verbatim: seq token, ms→smoothTime clamp, native transition promise, failsafe race, finally-restore. Export `VESTIBULE_POSE`, `lanternFocusPose`, `bootDone`.
4. **Focus→flight effect** — `poseForFocus` + the §2.3 effect (initial-mount skip, stale-focus reset, layout dependency).
5. **`useWorldKeys.ts`** — capture-phase listener, verbatim typing guard (GlobalHotkeys.tsx:89-98), modifier bail, Esc/1–9 map, `layoutRef` pattern, boot gate first line.
6. **Boot gate** — `worldEvents.on("boot-complete", …)` + reset-then-flag ordering + 8 s failsafe (§3.4).
7. **Hover convention comment block** — §4.1 copied at the top of `CameraRig.tsx` as the canonical reference for U-06/09/10 executors.
8. **Demand-mode verification** — the §5.1 devtools protocol: glide sustains frames, idle goes to zero rAF. Fix only if broken.
9. **Wire `<CameraRig/>` into `WorldScene.tsx`** at the marked Wave-2 slot (`WorldScene.tsx:57`).
10. **Commits** (per repo rule, explicit pathspecs): (a) `useFocusStack.ts`, (b) `CameraRig.tsx` + `useWorldKeys.ts`, (c) WorldScene wiring — three focused commits minimum.

---

## 8. Acceptance (run all; PLAN §6 U-07 + §11 flight checklist)

- [ ] **Click bough → ~700 ms glide** to `boughFocusPose`, eased (SmoothDamp — fast start, feathered arrival), no snap, no overshoot oscillation.
- [ ] **Click lantern from the vestibule** → single glide to reading distance (1.2 m out, 0.25 m up, looking back toward the trunk); the two-push convention leaves the stack `[vestibule, bough, lantern]`.
- [ ] **Esc walks back** lantern→bough→vestibule; **Esc×3 from ANY depth lands on the dais** (`VESTIBULE_POSE`), further Esc is a silent no-op.
- [ ] **`3` flies to the third area** (sidebar order); digits beyond the bough count do nothing; `Ctrl+3` still performs the 2D tab-swap (modifier bail verified).
- [ ] **Typing guard:** with any INPUT/TEXTAREA/SELECT/contenteditable focused, digits and Esc reach the field, not the camera.
- [ ] **Hover lifts emissive within 100 ms** and settles back after pointer-out; frames demanded only while the damp is moving.
- [ ] **`cameraBus.flyTo` from the console** resolves at rest; a second `flyTo` fired mid-glide redirects smoothly and BOTH promises resolve; `smoothTime` reads `0.35` afterward.
- [ ] **Boot gate:** before `worldEvents.emit("boot-complete")` (or the 8 s failsafe), keys and clicks move nothing; after it, the world answers and starts at the vestibule.
- [ ] **Zero rAF when idle:** 4 s hands-off after any interaction → devtools Performance shows no rAF activity from this unit (PLAN §7.5, §7.10).
- [ ] `tsc --noEmit` green; no new deps in `package.json`; `camera-controls` imported only as drei's transitive dep.

*— Fable. The camera is the body; keep it damped, gated, and asleep. Hand the torch to Opus.*
