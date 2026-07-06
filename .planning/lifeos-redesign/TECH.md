# LifeOS 3D / Holographic Redesign — Tech Research (2026)

> A first-person, "video-game-like" spatial workspace (JARVIS / Iron-Man-HUD energy)
> layered onto the existing **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4**
> LifeOS app. Tasks / areas / projects / captures / calendar become interactive objects and
> swipeable holographic panels inside a navigable 3D world.
>
> Scope of this doc: **technical research only** — what to install, how it fits App Router,
> what's production-ready in 2026, and where the pain is. No application code was changed.
>
> Researched: **2026-07-06**. Versions verified against npm registry / official docs on this date.

---

## TL;DR / Verdict

- **Build it with React Three Fiber v9 + drei v10 + @react-three/uikit**, mounted as an
  `ssr:false` dynamic-imported client island inside an App Router route. This is a well-trodden,
  production-ready path in 2026. ([R3F install docs](https://github.com/pmndrs/react-three-fiber/blob/master/docs/getting-started/installation.mdx), [Three.js + Next.js 2026 guide](https://threejsresources.com/frameworks/three-js-nextjs))
- **Ship on the WebGL renderer for v1** (the default). WebGPU (`three/webgpu` + TSL) is genuinely
  production-ready as of Three.js r171+ / Safari 26, but the R3F+drei+postprocessing ecosystem is
  only *partially* WebGPU-ready (notably `@react-three/postprocessing` is WebGL-only). Treat WebGPU
  as a fast-follow, gated behind a capability probe. ([WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer), [Three.js 2026 guide](https://www.oflight.co.jp/en/columns/threejs-webgpu-tsl-r3f-2026), [Wawa Sensei WebGPU/TSL](https://wawasensei.dev/courses/react-three-fiber/lessons/webgpu-tsl))
- **Do the real interactive UI (buttons, lists, forms, the areas tree) with `@react-three/uikit`**,
  not hundreds of drei `<Html>` overlays. `<Html>` is perfect for a *handful* of rich DOM panels
  and for real text inputs, but it creates a React DOM root per instance and does not scale to
  hundreds of live objects. ([uikit](https://www.npmjs.com/package/@react-three/uikit), [drei Html perf discussion](https://github.com/pmndrs/react-three-fiber/discussions/3130))
- **Always keep the existing 2D app as the primary, fast data-entry mode.** The 3D world is an
  alternate "cockpit" view. This is the single most important risk mitigation: text input,
  accessibility, and quick capture stay painless in 2D.

---

## 1. Core 3D stack (R3F + drei on React 19 / Next 16 App Router)

### Version compatibility (verified 2026-07-06)

| Package | Version | Notes |
|---|---|---|
| `three` | **0.185.1** (Jul 1 2026; r184 milestone Apr 16 2026) | WebGPU production-ready since r171; r184 (Mar/Apr 2026) killed per-frame allocations for steadier frame rates. ([three npm](https://registry.npmjs.org/three), [r184](https://github.com/mrdoob/three.js/releases/tag/r184)) |
| `@react-three/fiber` | **9.6.1** (Apr 28 2026) | **v9 pairs with React 19; v8 pairs with React 18.** v10 exists only as alpha/canary (WebGPU/TSL-first) — do **not** use in prod yet. ([R3F npm](https://www.npmjs.com/package/@react-three/fiber), [install docs](https://github.com/pmndrs/react-three-fiber/blob/master/docs/getting-started/installation.mdx)) |
| `@react-three/drei` | **10.7.7** | Helpers/abstractions (controls, Text, Html, Environment, transmission material, etc.). Uses `three-stdlib`. ([drei npm](https://www.npmjs.com/package/@react-three/drei)) |
| `@react-three/postprocessing` | **3.0.4** | Bloom, etc. Peer: `@react-three/fiber ^9`, `react ^19`, `three >=0.156`. **WebGL only.** ([postprocessing npm](https://registry.npmjs.org/%40react-three%2Fpostprocessing)) |

R3F is explicit: *"@react-three/fiber@9 pairs with react@19"* — so the existing React 19 app is exactly
right. ([R3F README](https://github.com/pmndrs/react-three-fiber/)).

### App Router integration (the load-bearing pattern)

Three.js touches `window`/`document` at import time, so it must never run during SSR. The canonical,
current pattern is a `'use client'` scene component **dynamically imported with `ssr: false`** from a
Server Component page, plus adding `three` to `transpilePackages`. ([Three.js+Next 2026](https://threejsresources.com/frameworks/three-js-nextjs), [R3F+Next tutorial 2026](https://noqta.tn/en/tutorials/react-three-fiber-nextjs-3d-interactive-web-2026), [R3F install docs](https://github.com/pmndrs/react-three-fiber/blob/master/docs/getting-started/installation.mdx))

```tsx
// app/(3d)/world/page.tsx  — Server Component
import dynamic from 'next/dynamic'

const World = dynamic(() => import('@/components/world/World'), {
  ssr: false,
  loading: () => <WorldSkeleton />, // paper-textured loader in brand aesthetic
})

export default function WorldPage() {
  return <World />
}
```

```tsx
// components/world/World.tsx — Client Component
'use client'
import { Canvas } from '@react-three/fiber'

export default function World() {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 6], fov: 55 }}
      dpr={[1, 2]}              // clamp devicePixelRatio (Retina!) — see Performance
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      frameloop="demand"        // on-demand rendering; see Performance
    >
      {/* scene graph */}
    </Canvas>
  )
}
```

```ts
// next.config.ts
const nextConfig = { transpilePackages: ['three'] }
export default nextConfig
```

**SSR pitfalls & gotchas**
- `'document is not defined'` / hydration errors = R3F ran on the server. Fix with `ssr:false` dynamic
  import; the Canvas boundary must be `'use client'`. ([Three.js+Next guide](https://threejsresources.com/frameworks/three-js-nextjs))
- Keep the Canvas island small: the whole three.js graph is client JS. Put data fetching (TanStack
  Query providers) *around* the island, not inside it, so the rest of the app stays RSC/SSR.
- Bundle size grows fast — code-split the world route, lazy-load heavy GLTF/HDRI assets. ([Three.js+Next guide](https://threejsresources.com/frameworks/three-js-nextjs))
- Turbopack (Next 16 default) handles `three` fine with `transpilePackages`; no `next-transpile-modules`
  needed on modern Next. ([R3F install docs](https://github.com/pmndrs/react-three-fiber/blob/master/docs/getting-started/installation.mdx))

### WebGL vs WebGPU in 2026

- **Three.js `WebGPURenderer` is production-ready** since r171 (Sep 2025); Safari 26 shipped WebGPU
  (Sep 2025) removing the last holdout, so all major browsers support it. r184 (2026) improved
  per-frame memory. It's a *universal* renderer: **automatic WebGL 2 fallback** when WebGPU is absent.
  ([WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer), [migration checklist](https://www.utsubo.com/blog/webgpu-threejs-migration-guide), [Three.js 2026 guide](https://www.oflight.co.jp/en/columns/threejs-webgpu-tsl-r3f-2026))
- **R3F v9 supports WebGPU** via an **async `gl` factory** (WebGPURenderer needs `await renderer.init()`).
  Import from `three/webgpu` and `three/tsl`; call `extend(THREE)`. ([R3F v9.0.0 release notes](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.0.0), [Wawa Sensei](https://wawasensei.dev/courses/react-three-fiber/lessons/webgpu-tsl))

```tsx
import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
extend(THREE as any)

<Canvas
  gl={async (props) => {
    const renderer = new THREE.WebGPURenderer(props as any)
    await renderer.init()
    return renderer
  }}
/>
```

**The catch for *this* project:** WebGPU drops support for `ShaderMaterial` / `RawShaderMaterial` /
`onBeforeCompile` (must move to **TSL node materials**), and the legacy `EffectComposer` doesn't exist
on WebGPU — you use Three's node-based `PostProcessing`/`RenderPipeline`. Critically,
**`@react-three/postprocessing` (our Bloom/glow layer) is WebGL-only and doesn't support WebGPU yet.**
([WebGPU migration](https://www.utsubo.com/blog/webgpu-threejs-migration-guide), [post-processing 2026](https://threejsroadmap.com/blog/the-complete-guide-to-threejs-post-processing-in-2026), [Wawa Sensei](https://wawasensei.dev/courses/react-three-fiber/lessons/webgpu-tsl))

**Recommendation:** ship **WebGL** for v1 (default renderer, `@react-three/postprocessing` Bloom works
out of the box). This is a single-user MacBook app — WebGL 2 is plenty. Add a WebGPU mode later,
gated on a `'gpu' in navigator` probe, once you're willing to reimplement glow via Three's node
post-pipeline (or drop postprocessing there). Don't block v1 on it.

---

## 2. The holographic look (glowing hologram / glass panels)

The JARVIS aesthetic = **emissive glow + selective bloom + glass/transmission + fresnel rim + a
dark, reflective environment**. Concrete drei/postprocessing building blocks:

### Bloom is the #1 lever (and it's "selective" by default)

`@react-three/postprocessing`'s `<Bloom>` is selective *by design*: set `luminanceThreshold={1}` so
nothing glows unless you push a material's color **above 1.0** (HDR) with `emissiveIntensity` and
`toneMapped={false}`. You usually **don't need `SelectiveBloom`** — just lift the colors of the things
you want to glow. ([Bloom docs](https://react-postprocessing.docs.pmnd.rs/effects/bloom))

```tsx
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

<EffectComposer>
  <Bloom mipmapBlur luminanceThreshold={1} intensity={1.2} />
  <Vignette offset={0.4} darkness={0.6} />
</EffectComposer>

// glowing hologram edge:
<meshStandardMaterial emissive="#5fd0ff" emissiveIntensity={2.4} toneMapped={false} />
```

### Glass panels — `MeshTransmissionMaterial` (use sparingly)

drei's `MeshTransmissionMaterial` extends `MeshPhysicalMaterial` with chromatic aberration,
roughness blur, distortion, and — unlike stock physical material — can "see" other transmissive
objects. It's the go-to for frosted/holographic glass panels. ([drei MeshTransmissionMaterial](http://drei.docs.pmnd.rs/shaders/mesh-transmission-material), [Codrops transmission tutorial](https://tympanus.net/codrops/2025/03/13/warping-3d-text-inside-a-glass-torus/))

```tsx
import { MeshTransmissionMaterial } from '@react-three/drei'

<mesh>
  <planeGeometry args={[1.6, 1, 1, 1]} />
  <MeshTransmissionMaterial
    transmission={1} thickness={0.35} ior={1.2} roughness={0.15}
    chromaticAberration={0.04} distortion={0.1} distortionScale={0.3}
    backside
    color="#bfe9ff"           // tint acts like looking through colored glass
  />
</mesh>
```

**Gotcha (big one for panels):** transmission does an **extra render pass of the scene per
transmissive object**. Dozens of glass panels = a serious bottleneck. Mitigations: enable
`transmissionSampler` to share one transmission texture across materials, lower `samples`/`resolution`,
or reserve `MeshTransmissionMaterial` for 1–3 "hero" panels and fake the rest with a cheaper
glass look (see below). ([drei docs](http://drei.docs.pmnd.rs/shaders/mesh-transmission-material), [Codrops](https://tympanus.net/codrops/2025/03/13/warping-3d-text-inside-a-glass-torus/))

### Cheaper "hologram panel" recipe (scales to many panels)

For the swipeable panel *grid*, avoid transmission. Instead compose:
- a semi-transparent `meshStandardMaterial`/`meshPhysicalMaterial` (low opacity, slight roughness),
- an **emissive rim/fresnel** (glowing edges) — either a fresnel term in a small custom shader, or
  the community "hologram" material pattern (fresnel + scanlines + flicker), or drei's
  `<Edges>` with an emissive `<meshBasicMaterial toneMapped={false}>` for glowing borders,
- a subtle `GradientTexture` (drei) as the panel background for the iridescent sheen,
- and let **Bloom** do the halo.

### Environment & lighting

Use drei `<Environment>` (HDRI or `preset`) + `<Lightformer>` to get the reflective, moody,
studio-lit look that makes glass/emissive read as "holographic." Transmission/physical materials
*need* an environment to look good (they reflect/refract it). ([Codrops transmission tutorial](https://tympanus.net/codrops/2025/03/13/warping-3d-text-inside-a-glass-torus/))

```tsx
import { Environment, Lightformer, GradientTexture } from '@react-three/drei'
<Environment preset="night" /* or custom .hdr */ resolution={256}>
  <Lightformer form="rect" intensity={2} position={[0, 3, -4]} scale={[6, 3, 1]} />
</Environment>
```

**Aesthetic tie-in:** the brand is "academic paper meets Notion, EB Garamond/Louize, Renaissance."
For the 3D cockpit, lean warm-paper + cyan/gold emissive accents rather than the clichéd all-blue
sci-fi HUD, so it stays on-brand rather than generic Iron-Man.

---

## 3. UI panels in 3D (interactive DOM vs uikit vs mesh UI)

Three approaches, each with a real place:

### A. `@react-three/uikit` — **recommended for the bulk of interactive UI**

`@react-three/uikit` (**v1.0.73**, May 27 2026) renders **flexbox UI (via Yoga) directly inside the
canvas** as three.js meshes — buttons, containers, text, scroll, images — with hover/click, all inside
the render loop. It's built for "games, XR, spatial computing." Pre-styled kits:
`@react-three/uikit-default` (Shadcn-like) and `@react-three/uikit-horizon` (Meta Horizon look).
([uikit npm](https://www.npmjs.com/package/@react-three/uikit), [uikit repo](https://github.com/pmndrs/uikit/), [uikit llms.txt](https://context7.com/pmndrs/uikit/llms.txt))

```tsx
import { Root, Container, Text } from '@react-three/uikit'
import { Button } from '@react-three/uikit-default'

<group position={[0, 1.4, 0]}>
  <Root sizeX={1.8} sizeY={1.1} flexDirection="column" padding={24} gap={12}
        backgroundColor="#0b1220" backgroundOpacity={0.6} borderRadius={16}>
    <Text fontSize={22} color="#eaf6ff">Today</Text>
    <Container flexDirection="column" gap={8} overflow="scroll" flexGrow={1}>
      {/* task rows */}
    </Container>
    <Button onClick={() => addTask()}><Text>New task</Text></Button>
  </Root>
</group>
```

- **Pros:** GPU-accelerated, one render loop (no per-panel DOM roots), scales to many panels, works
  with billboarding/dragging, responsive props (`sm`/`md`/…), themeable. Best interactivity-vs-perf
  tradeoff for a data-dense HUD. ([uikit repo](https://github.com/pmndrs/uikit/))
- **Cons:** it's *not* the DOM — no native form controls, no real `<input>` caret, weaker
  accessibility, and you re-implement anything fancy. Text input especially is a weak spot.
- **Perf note:** uikit had allocation-hotpath perf issues under heavy updates in 1.0.x that were being
  patched — keep it current and avoid per-frame prop thrash. ([uikit perf issue #241](https://github.com/pmndrs/uikit/issues/241))

### B. drei `<Html>` — **for a few rich DOM panels + real text inputs**

`<Html>` projects real DOM into the scene. Great for: the one big "detail/editor" panel, a real
`<textarea>` for quick capture, a date picker, or any place you want actual HTML/CSS/accessibility.
Key props: `transform` (matrix3d, lives *in* 3D space), `distanceFactor` (screen-space scaling),
`occlude` (`true`/refs, or `"blending"`), `center`, `portal`, `zIndexRange`, `sprite`. ([drei Html docs](http://drei.docs.pmnd.rs/misc/html))

**The scaling trap:** each `<Html>` is a `ReactDOM.createRoot(...).render(...)` — literally a separate
React root. A handful is fine; **hundreds tank FPS** (each competes with the DOM + three loops, plus
CSS3D placement math). For occlusion, **prefer `occlude="blending"` over raycast** — raycast occlusion
re-raycasts the whole scene and is expensive. ([drei Html perf discussion](https://github.com/pmndrs/react-three-fiber/discussions/3130), [three.js forum: Html perf](https://discourse.threejs.org/t/html-tag-low-performance-react/48917))

Also: `distanceFactor` scaling can "freeze" during camera tweens under `frameloop="demand"` — call
`invalidate()` during transitions, or use `transform` mode. ([forum: frozen scale](https://discourse.threejs.org/t/r3f-react-three-drei-html-distancefactor-scaling-breaks-during-camera-transitions/90429))

### C. Pure mesh UI / render-to-texture — for many *non-interactive* labels

For thousands of read-only labels/badges, don't use Html or heavy panels — use instanced meshes +
drei `<Text>` (SDF) or bake a canvas texture. Reserve interactivity for the focused/nearby panels.

### Verdict on panels
- **uikit** for the task lists, area tree rows, buttons, project cards, kanban tiles — the interactive
  bulk.
- **`<Html>`** for 1–3 focused editor panels and any real text input.
- Everything far/ambient = cheap meshes + SDF text.

### "Swipeable holographic panels" (draggable / rotatable / billboarding)

- **Billboarding:** wrap a panel in drei `<Billboard>` so it always faces the camera (or lock to Y for
  a "carousel of cards" that stays upright). Note billboard matrix updates aren't free at scale —
  billboard only what's near/active. ([drei Html perf discussion mentions billboard cost](https://github.com/pmndrs/react-three-fiber/discussions/3130))
- **Drag/swipe:** use R3F pointer events (`onPointerDown/Move/Up`) with `setPointerCapture`, drive a
  spring for the throw/settle (`@react-spring/three`), and page a horizontal panel stack like a
  card deck. drei `<DragControls>` handles simple object dragging; for swipe-to-page you'll want a
  small custom gesture + spring.
- **Rotate/tilt:** apply pointer delta to panel rotation, damp back to rest with `maath` `easing.damp`
  or a spring for the "floaty HUD" feel.

---

## 4. First-person navigation (comfortable, non-nauseating, laptop-friendly)

drei ships all the controls; pick by intent. ([r3f-interaction skill](https://playbooks.com/skills/enzed/r3f-skills/r3f-interaction), [r3f skill 2026](https://playbooks.com/skills/anthemflynn/ccmp/react-three-fiber))

| Control | Use for | Caveats |
|---|---|---|
| `PointerLockControls` | True FPS mouse-look + WASD | **No built-in WASD** — pair with drei `KeyboardControls` and move in `useFrame`. Pointer-lock hides the cursor → hostile to clicking DOM UI; motion can be nauseating. ([FP movement demo](https://github.com/jgcarrillo/react-fp-movement), [SO: PLC+WASD](https://stackoverflow.com/questions/68494059/trying-to-work-with-pointerlockcontrols-wasd-keys-and-three-js)) |
| `OrbitControls` | Orbit/inspect a focused object; damped, pan/zoom | `makeDefault`, `enableDamping`. Under `frameloop="demand"` call `invalidate()` on change. ([r3f-interaction](https://playbooks.com/skills/enzed/r3f-skills/r3f-interaction)) |
| `CameraControls` (drei, wraps `camera-controls`) | **Smooth fly-to / focus transitions** — `setLookAt(px,py,pz, tx,ty,tz, true)` animates the camera to an object | Best fit for "click an area → glide in." ([r3f-interaction](https://playbooks.com/skills/enzed/r3f-skills/r3f-interaction)) |
| `FlyControls` / `MapControls` | Free-fly / top-down | Fly is nausea-prone; Map is good for a "desk from above" 2.5D mode. |

**Recommended movement model for a laptop, non-nauseating UX:**
1. **Default = "guided orbit + fly-to focus"**, not free FPS. The world is a set of stations (Areas =
   rooms/islands, Projects = clusters, Today = a HUD). Clicking an object uses `CameraControls.setLookAt`
   to **glide** to it (ease-out, ~600–900ms). This is the comfortable, Apple-y feel and avoids the
   motion-sickness of raw WASD + mouse-look.
2. **Optional "explore" mode** with `PointerLockControls` + `KeyboardControls` (WASD + look) for people
   who want to walk around — but keep it opt-in and add comfort options (FOV control, movement damping,
   optional vignette-on-move, no head-bob).
3. **Trackpad-friendliness:** OrbitControls/CameraControls handle two-finger pan + pinch-zoom natively;
   this matters more than WASD for a MacBook user.

**Object selection (raycasting):** R3F gives you raycasting for free via mesh pointer events
(`onClick`, `onPointerOver/Out`); the event carries `point`, `face`, `distance`, `object`, `camera`,
`ray`. For a dense scene, accelerate raycasts with **`three-mesh-bvh`** via drei `<Bvh firstHitOnly>`
(wrap the world). Add `onPointerOver` hover highlights (emissive lift) for that "interactive HUD" feel.
([r3f-interaction selection](https://playbooks.com/skills/enzed/r3f-skills/r3f-interaction), [r3f 2026 skill events](https://playbooks.com/skills/anthemflynn/ccmp/react-three-fiber), [three-mesh-bvh](https://www.npmjs.com/package/three-mesh-bvh), [drei Bvh source](https://github.com/pmndrs/drei/blob/7d901b5c/src/core/Bvh.tsx))

```tsx
import { Bvh, CameraControls, KeyboardControls } from '@react-three/drei'
// Wrap selectable world in <Bvh firstHitOnly> ; click → controls.setLookAt(...true)
```

---

## 5. Text + icons in 3D

- **drei `<Text>` wraps `troika-three-text`** — runtime **SDF** glyph generation (parses .ttf/.otf/.woff
  directly, builds the SDF atlas on demand in a **web worker**, handles kerning/ligatures/RTL, patches
  any three material so text still gets lighting/fog). This is the standard for crisp world-space
  labels (task titles, dates, counts). ([troika docs](https://protectwise.github.io/troika/troika-three-text/), [troika npm](https://www.npmjs.com/package/troika-three-text))
- **Quality knob:** `sdfGlyphSize` (power-of-two) — raise it for sharper corners/thin strokes at the
  cost of memory + generation time. Preload/pre-generate glyphs for known character sets to avoid
  first-render pop. ([troika docs](https://protectwise.github.io/troika/troika-three-text/))
- **Use your brand fonts:** point `<Text font="/fonts/EBGaramond.woff">` (and Louize where licensed) so
  the 3D world matches the paper aesthetic.
- **Perf:** `<Text>` is cheap-ish but not free at thousands of instances (each is geometry). For dense
  numeric labels, batch, cull by distance, or drop labels beyond N meters (LOD). drei `<Billboard>`
  keeps labels camera-facing. For icons, prefer SDF/`<Text>` icon fonts or instanced textured quads over
  many separate meshes.

```tsx
import { Text } from '@react-three/drei'
<Text font="/fonts/EBGaramond.woff" fontSize={0.12} sdfGlyphSize={64}
      color="#eaf6ff" anchorX="left" maxWidth={1.4}>
  Finish Kiwi routing eval
</Text>
```

---

## 6. Performance (smooth 60fps, single-user, MacBook)

Targets & levers (single-user app → optimize for a locked 60fps and low fan noise):

- **On-demand rendering:** set `<Canvas frameloop="demand">`. The loop sleeps when nothing changes and
  renders only on prop changes / `invalidate()`. Controls (`OrbitControls`) and **`@react-spring/three`
  auto-invalidate**, so animations still play; call `invalidate()` yourself for imperative updates. This
  is the biggest battery/fan win for a mostly-static HUD. ([scaling-performance docs](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx), [forum: rAF in R3F](https://discourse.threejs.org/t/requestanimationframe-in-react-three-fiber/41967), [react-spring demand fix PR](https://github.com/pmndrs/react-spring/pull/2536))
  - Caveat: with synchronous animations, pre-schedule a frame before starting to avoid a visible jump.
    ([scaling-performance docs](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx))
- **Clamp DPR:** `dpr={[1, 2]}` on Canvas — Retina at native 2–3x is a huge fill-rate cost. Consider
  drei `<PerformanceMonitor>` to drop DPR/quality adaptively.
- **Instancing:** each mesh = a draw call; **keep under ~1000, ideally a few hundred**. Render many
  similar objects (task cubes, area nodes, stars) as a single `InstancedMesh` (drei `<Instances>`/
  `<Instance>` declaratively, or imperative `setMatrixAt` for very large counts to skip React
  reconciliation). ([scaling-performance docs](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx), [pitfalls docs](https://github.com/pmndrs/react-three-fiber/blob/e53d667a/docs/advanced/pitfalls.mdx))
- **Share geometries/materials; don't mount/unmount hot.** Object creation (material compile, geometry
  processing) is the classic three.js cost — reuse, and animate by **mutation in `useFrame`** (`lerp`/
  `damp`), never by re-mounting. ([pitfalls docs](https://github.com/pmndrs/react-three-fiber/blob/e53d667a/docs/advanced/pitfalls.mdx))
- **LOD & culling:** drei `<Detailed>` for LOD; distance-cull labels/panels; only billboard/`<Html>`
  what's near or focused (see §3).
- **Postprocessing cost:** Bloom is the main GPU tax — use `mipmapBlur`, modest resolution, one composer.
- **Transmission cost:** limit `MeshTransmissionMaterial` objects (extra scene pass each — §2).
- **`useFrame` discipline:** one shared rAF; never call `requestAnimationFrame` yourself; use
  `startTransition` for expensive non-visual updates. ([forum: rAF](https://discourse.threejs.org/t/requestanimationframe-in-react-three-fiber/41967), [pitfalls docs](https://github.com/pmndrs/react-three-fiber/blob/e53d667a/docs/advanced/pitfalls.mdx))
- **Memory/GPU on MacBook:** dispose GLTF/textures on unmount, keep HDRI resolution low (`resolution={256}`),
  prefer compressed textures (KTX2) for any imagery, and watch texture count from many `<Html>`/panels.

---

## 7. Live data integration (TanStack Query + Supabase Realtime → 3D)

The existing stack already uses **TanStack Query + Supabase Realtime** (Realtime = invalidation signal,
Query = cache/optimism). Extend that same pattern into the 3D world — don't build a parallel store.

**Pattern:**
1. Keep the current hooks (`useTasks()`, `useAreas()`, …) returning normalized rows from TanStack Query;
   Supabase Realtime `invalidateQueries` on row changes (unchanged from 2D).
2. In the scene, a `<TasksLayer>` reads the query data and maps rows → an `InstancedMesh` (one instance
   per task) + a lookup `Map<taskId, instanceIndex>`. Areas/projects → clusters/anchors.
3. **Animate on change** rather than snap:
   - Position/scale/opacity transitions via **`@react-spring/three`** (`useSpring`/`a.mesh`) — it
     animates *outside* React and auto-invalidates under `frameloop="demand"`. Great for
     enter/leave/settle. ([pitfalls: react-spring](https://github.com/pmndrs/react-three-fiber/blob/e53d667a/docs/advanced/pitfalls.mdx), [demand fix PR](https://github.com/pmndrs/react-spring/pull/2536))
   - For continuous/ambient motion or cheapest-per-frame, use `lerp`/`maath` `easing.damp` in
     `useFrame` (cheaper than springs when you want raw FPS). ([discussion: spring vs lerp](https://github.com/pmndrs/react-three-fiber/discussions/1884))
   - `motion/react` (Motion, already in the stack) drives the **2D HUD overlay** and route transitions;
     `@react-spring/three` (or `useFrame`) drives **in-scene** objects. (Motion also has a three
     integration, but react-spring is the battle-tested R3F choice here.)
4. New task appears (Realtime) → Query invalidates → layer diff adds an instance → spring scales it in
   from 0 with an emissive "pop" + a UI sound (§8). Completion → spring out + fade. This is what makes
   the world feel *alive* with real data.

**Key rule:** map DB rows → instance transforms/uniforms; drive transforms by mutation/springs. Avoid
mounting a heavy React component per row.

---

## 8. Audio / feel (game-y polish)

- **Spatial audio:** three.js has `PositionalAudio` (WebAudio, HRTF panning); drei wraps it as
  `<PositionalAudio url=... />`, which attaches an `AudioListener` to the camera automatically. Use for
  world-anchored sound (a project cluster humming, a calendar portal chime as you approach).
  Browsers block audio until a **user gesture** — start on first click/interaction. ([drei PositionalAudio source](https://github.com/pmndrs/drei/blob/master/src/core/PositionalAudio.tsx), [drei audio tutorial](https://www.youtube.com/watch?v=NE2vE8MhtGY))
- **Non-spatial UI SFX:** for clicks, hovers, task-complete "ding," a lightweight sprite-based library
  like **howler** is convenient (sprite sheets, pooling, volume, mobile unlock) — or just raw WebAudio
  with a small pool if you want zero deps. Keep clips tiny and preloaded.
- **"Haptic-ish" motion polish:** micro-springs on hover/press (scale 1→1.04), a subtle camera
  push-in on focus, easing.damp settling, a faint bloom pulse on state change. Pair each meaningful
  action with a short sound → strong game feel. Respect a global mute + `prefers-reduced-motion`.

---

## 9. Fallback / dual-mode (fast 2D + progressive enhancement)

**Core principle: 2D is the default, always-available mode for real work; 3D is an opt-in cockpit.**

- **Dual-mode routing:** keep the existing 2D app fully intact (fast capture, keyboard, forms,
  accessibility). Add the 3D world as a separate route/view toggle (e.g. `/world`). Same data hooks,
  two presentations. This directly serves the project's "type one sentence into Kiwi" value — quick
  entry never depends on the GPU path.
- **Capability gating / progressive enhancement:**
  - Probe WebGL2 (and later `'gpu' in navigator` for WebGPU); if unavailable or context-lost → fall
    back to 2D automatically. WebGPURenderer already auto-falls back WebGPU→WebGL2. ([WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer))
  - Respect **`prefers-reduced-motion`**: disable auto-fly, bloom pulses, floaty idle motion; make
    transitions instant; consider defaulting such users to 2D.
  - Detect low-power/integrated GPUs (or use drei `<PerformanceMonitor>` to downgrade DPR/effects, and
    surface a "switch to 2D for speed" nudge if FPS stays low).
- **SSR-safe:** the 2D app stays server-rendered; the 3D route is the only `ssr:false` island, so SEO/
  first paint of the core app is unaffected.

---

## 10. Risks & hard parts (be honest)

| Risk | Severity | Reality / mitigation |
|---|---|---|
| **Text input in 3D** | High | uikit has no true DOM `<input>` caret; typing in-world is clumsy. **Do all real editing via drei `<Html>` panels or, better, the 2D mode.** Don't try to rebuild a rich text editor in-scene. |
| **Interactive DOM-in-3D at scale** | High | `<Html>` = a React DOM root per instance; hundreds tank FPS, and occlusion via raycast is expensive. Use **uikit** for many interactive elements; reserve `<Html>` for a few focused panels; use `occlude="blending"`. ([discussion #3130](https://github.com/pmndrs/react-three-fiber/discussions/3130), [forum](https://discourse.threejs.org/t/html-tag-low-performance-react/48917)) |
| **Accessibility** | High | Canvas UI is largely invisible to screen readers / keyboard nav. The 2D mode must remain the accessible, WCAG-friendly path. Add ARIA to `<Html>` panels where used; don't regress a11y. |
| **SSR / hydration** | Medium | Solved but unforgiving: any three import on the server crashes. Strict `ssr:false` island boundary + `transpilePackages:['three']`. ([Three.js+Next](https://threejsresources.com/frameworks/three-js-nextjs)) |
| **Bundle size** | Medium | three + drei + uikit + postprocessing is heavy client JS. Route-level code-split, lazy assets, and it only loads when entering `/world`. ([Three.js+Next](https://threejsresources.com/frameworks/three-js-nextjs)) |
| **WebGPU ecosystem gaps** | Medium | `@react-three/postprocessing` is WebGL-only; WebGPU needs TSL node materials + Three's node post-pipeline. Ship WebGL first; WebGPU later. ([Wawa Sensei](https://wawasensei.dev/courses/react-three-fiber/lessons/webgpu-tsl), [post-processing 2026](https://threejsroadmap.com/blog/the-complete-guide-to-threejs-post-processing-in-2026)) |
| **Motion sickness** | Medium | Raw WASD+mouse-look nauseates many users. Default to guided fly-to (`CameraControls.setLookAt`), make free-fly opt-in, honor reduced-motion. |
| **Transmission perf** | Medium | Each `MeshTransmissionMaterial` object = extra scene pass. Limit to hero panels; fake the rest. ([drei docs](http://drei.docs.pmnd.rs/shaders/mesh-transmission-material)) |
| **uikit maturity** | Low–Med | v1.x had allocation/perf hotspots under heavy UI updates (being patched). Pin current, avoid per-frame prop churn. ([issue #241](https://github.com/pmndrs/uikit/issues/241)) |
| **Electron/desktop** | Low (for now) | The existing desktop app can host the WebGL world, but GPU/driver variance + bundle size add QA surface. Validate on the actual target before committing. |
| **Mobile** | Low (single-user MacBook) | `<Html>` panels are notably slower on iOS Safari; not a v1 concern here but keep the 2D fallback. ([forum: iOS Html perf](https://discourse.threejs.org/t/html-tag-low-performance-react/48917)) |

**Where to deliberately stay 2D:** all text-heavy editing, quick capture, forms/settings, dense list
management, and anything accessibility-critical. The 3D world is for *navigation, overview, and delight*
— an at-a-glance spatial map of your life-OS — not for data entry.

---

## RECOMMENDED STACK (exact packages to install)

All versions verified on **npm, 2026-07-06**. Pin these; the R3F/three ecosystem moves fast and v10 of
R3F is still prerelease.

### Required — core 3D + holographic look
```bash
npm install \
  three@0.185.1 \
  @react-three/fiber@9.6.1 \
  @react-three/drei@10.7.7 \
  @react-three/postprocessing@3.0.4
```
- `three@0.185.1` — renderer, materials, WebGL2 (WebGPU available via `three/webgpu` when you opt in). ([three npm](https://registry.npmjs.org/three))
- `@react-three/fiber@9.6.1` — **must be v9 for React 19.** ([R3F npm](https://www.npmjs.com/package/@react-three/fiber))
- `@react-three/drei@10.7.7` — controls, `<Text>`, `<Html>`, `<Environment>`, `MeshTransmissionMaterial`,
  `<Bvh>`, `<Billboard>`, `<Instances>`, `<PositionalAudio>`, `KeyboardControls`, `CameraControls`,
  `PerformanceMonitor`. ([drei npm](https://www.npmjs.com/package/@react-three/drei))
- `@react-three/postprocessing@3.0.4` — Bloom/Vignette (WebGL). ([postprocessing npm](https://registry.npmjs.org/%40react-three%2Fpostprocessing))

### Required — in-scene interactive UI
```bash
npm install \
  @react-three/uikit@1.0.73 \
  @react-three/uikit-default@1.0.73
```
- Flexbox 3D UI (Yoga) + Shadcn-style prebuilt components. (`@react-three/uikit-horizon` optional for a
  Meta-Horizon look.) ([uikit npm](https://www.npmjs.com/package/@react-three/uikit), [uikit repo](https://github.com/pmndrs/uikit/))

### Required — animation + raycast acceleration
```bash
npm install \
  @react-spring/three@latest \
  maath@latest \
  three-mesh-bvh@0.9.10
```
- `@react-spring/three` — spring animation that auto-invalidates under `frameloop="demand"`; use the
  latest (recent versions fixed demand-mode looping). Pin whatever `npm view @react-spring/three version`
  returns at install time. ([demand fix PR](https://github.com/pmndrs/react-spring/pull/2536), [pitfalls docs](https://github.com/pmndrs/react-three-fiber/blob/e53d667a/docs/advanced/pitfalls.mdx))
- `maath` — pmndrs math helpers (`easing.damp*`) for cheap, framey easing in `useFrame`.
- `three-mesh-bvh@0.9.10` — accelerated raycasting for object selection in a dense scene (used by drei
  `<Bvh>`). ([three-mesh-bvh npm](https://www.npmjs.com/package/three-mesh-bvh))

### Optional — audio + dev ergonomics
```bash
npm install howler@latest          # UI SFX (sprites, pooling, mobile unlock)
npm install -D leva@latest         # live-tweak material/lighting params during dev
npm install -D @types/three        # if not already present (TS types for three)
```
- `howler` for non-spatial UI sound; spatial sound uses drei `<PositionalAudio>` (no extra dep).
  ([drei PositionalAudio](https://github.com/pmndrs/drei/blob/master/src/core/PositionalAudio.tsx))
- `leva` is the standard drei-adjacent GUI for dialing in the holographic look fast. ([transmission tutorial uses leva](https://blog.olivierlarose.com/tutorials/3d-glass-effect))

### Config
```ts
// next.config.ts
export default { transpilePackages: ['three'] }
```
Mount the world as a `'use client'` component behind `dynamic(() => import(...), { ssr: false })`. Set
`<Canvas frameloop="demand" dpr={[1,2]} gl={{ powerPreference:'high-performance' }} />`.

### Deferred (fast-follow, not v1)
- `three/webgpu` + `three/tsl` for a WebGPU mode (async `gl` factory; requires TSL node materials and
  Three's node post-pipeline instead of `@react-three/postprocessing`). Gate behind `'gpu' in navigator`.
  ([R3F v9 WebGPU](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.0.0), [Wawa Sensei](https://wawasensei.dev/courses/react-three-fiber/lessons/webgpu-tsl))
- `@react-three/xr` — only if you ever want VR/AR; irrelevant for the MacBook MVP.

---

## Suggested build order (de-risked)

1. **Spike the island:** `/world` route, `ssr:false` Canvas, one instanced mesh of tasks from live
   TanStack Query data, `frameloop="demand"`, OrbitControls. Prove data→3D + SSR safety.
2. **Navigation model:** `CameraControls` fly-to on click + `<Bvh>` selection + hover highlight.
3. **Panels:** one uikit "Today" panel bound to live tasks; one `<Html>` editor panel for detail/edit.
4. **Holographic pass:** Environment + emissive + Bloom + 1–2 transmission hero panels + brand-font
   `<Text>` labels.
5. **Feel:** react-spring enter/leave on data changes, UI SFX, reduced-motion + 2D fallback wired.
6. **(Later)** WebGPU mode behind a capability flag.

---

## Sources

Core 3D / Next.js integration
- Three.js + Next.js Integration Guide (2026) — https://threejsresources.com/frameworks/three-js-nextjs
- R3F + Next.js tutorial (2026) — https://noqta.tn/en/tutorials/react-three-fiber-nextjs-3d-interactive-web-2026
- R3F installation docs (React 18↔v8 / React 19↔v9; transpilePackages) — https://github.com/pmndrs/react-three-fiber/blob/master/docs/getting-started/installation.mdx
- R3F README — https://github.com/pmndrs/react-three-fiber/
- R3F v9.0.0 release notes (async `gl`, WebGPU) — https://github.com/pmndrs/react-three-fiber/releases/tag/v9.0.0
- `@react-three/fiber` npm (9.6.1) — https://www.npmjs.com/package/@react-three/fiber
- `three` npm (0.185.1) — https://registry.npmjs.org/three ; r184 — https://github.com/mrdoob/three.js/releases/tag/r184

WebGPU / TSL / post-processing
- WebGPURenderer manual — https://threejs.org/manual/en/webgpurenderer
- Three.js → WebGPU migration checklist (2026) — https://www.utsubo.com/blog/webgpu-threejs-migration-guide
- Three.js Complete Guide 2026 (WebGPU/TSL/R3F) — https://www.oflight.co.jp/en/columns/threejs-webgpu-tsl-r3f-2026
- Three.js Migration Guide (three/webgpu, three/tsl) — https://github.com/mrdoob/three.js/wiki/Migration-Guide
- Wawa Sensei — WebGPU / TSL in R3F (postprocessing not WebGPU-ready) — https://wawasensei.dev/courses/react-three-fiber/lessons/webgpu-tsl
- Post-processing in 2026 (RenderPipeline vs EffectComposer) — https://threejsroadmap.com/blog/the-complete-guide-to-threejs-post-processing-in-2026

Holographic look
- drei MeshTransmissionMaterial — http://drei.docs.pmnd.rs/shaders/mesh-transmission-material
- Codrops transmission tutorial — https://tympanus.net/codrops/2025/03/13/warping-3d-text-inside-a-glass-torus/
- 3D glass effect tutorial — https://blog.olivierlarose.com/tutorials/3d-glass-effect
- React postprocessing Bloom (selective by default) — https://react-postprocessing.docs.pmnd.rs/effects/bloom
- `@react-three/postprocessing` npm (3.0.4) — https://registry.npmjs.org/%40react-three%2Fpostprocessing

UI panels in 3D
- `@react-three/uikit` npm (1.0.73) — https://www.npmjs.com/package/@react-three/uikit
- uikit repo — https://github.com/pmndrs/uikit/
- uikit llms.txt (usage) — https://context7.com/pmndrs/uikit/llms.txt
- uikit perf issue #241 — https://github.com/pmndrs/uikit/issues/241
- drei `<Html>` docs — http://drei.docs.pmnd.rs/misc/html
- drei Html not performant at scale (discussion #3130) — https://github.com/pmndrs/react-three-fiber/discussions/3130
- three.js forum: Html tag low performance — https://discourse.threejs.org/t/html-tag-low-performance-react/48917
- three.js forum: Html distanceFactor frozen during camera transitions — https://discourse.threejs.org/t/r3f-react-three-drei-html-distancefactor-scaling-breaks-during-camera-transitions/90429

Navigation / selection
- r3f-interaction skill (OrbitControls / PointerLockControls / CameraControls / selection) — https://playbooks.com/skills/enzed/r3f-skills/r3f-interaction
- react-three-fiber skill 2026 (versions, events, demand) — https://playbooks.com/skills/anthemflynn/ccmp/react-three-fiber
- First-person movement demo (PLC + WASD via useFrame) — https://github.com/jgcarrillo/react-fp-movement
- SO: PointerLockControls + WASD (no built-in keys) — https://stackoverflow.com/questions/68494059/trying-to-work-with-pointerlockcontrols-wasd-keys-and-three-js
- three-mesh-bvh npm (0.9.10) — https://www.npmjs.com/package/three-mesh-bvh
- drei `<Bvh>` source — https://github.com/pmndrs/drei/blob/7d901b5c/src/core/Bvh.tsx

Text
- Troika three-text docs — https://protectwise.github.io/troika/troika-three-text/
- troika-three-text npm — https://www.npmjs.com/package/troika-three-text
- Troika SDF text intro (three.js forum) — https://discourse.threejs.org/t/troika-3d-text-library-for-sdf-text-rendering/15111

Performance / animation
- R3F scaling-performance docs (on-demand, instancing) — https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx
- R3F pitfalls docs (mutation, react-spring, startTransition) — https://github.com/pmndrs/react-three-fiber/blob/e53d667a/docs/advanced/pitfalls.mdx
- forum: requestAnimationFrame in R3F (frameloop=demand, invalidate) — https://discourse.threejs.org/t/requestanimationframe-in-react-three-fiber/41967
- discussion: frameloop=demand + react-spring vs lerp — https://github.com/pmndrs/react-three-fiber/discussions/1884
- react-spring PR: demand-mode looping fix — https://github.com/pmndrs/react-spring/pull/2536

Audio
- drei PositionalAudio source — https://github.com/pmndrs/drei/blob/master/src/core/PositionalAudio.tsx
- R3F Audio/PositionalAudio tutorial — https://www.youtube.com/watch?v=NE2vE8MhtGY
