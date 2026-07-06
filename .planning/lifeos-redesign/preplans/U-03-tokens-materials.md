# U-03 · tokens-materials — Fable Pre-Plan Seed

> For the Opus executor. Design memo only — no code exists yet. This freezes the material
> layer's public contract for the whole Phase-1 fleet (U-06 boughs, U-09 embers, U-10 lanterns,
> U-13 ring/ribbon, U-14 fireflies all consume it). Read PLAN.md §6 U-03 + §7 first; those are
> law. Everything below was verified against three r185 / drei 10.7.7 / fiber 9.6.1 on 2026-07-06.
>
> Files you will create (nothing else):
> - `apps/web/components/world/materials/tokens.ts`
> - `apps/web/components/world/materials/hologram.ts`
> - `apps/web/components/world/materials/sharedGeometries.ts`
>
> Hard rules inherited: WebGL renderer (no TSL, `onBeforeCompile` is sanctioned WebGL-only debt
> per PLAN §10); Bloom is `luminanceThreshold={1}` so glow = `toneMapped:false` + emitted
> radiance > 1.0; ≤6 shader programs from this layer; `MeshTransmissionMaterial` ≤3 live
> instances, dev-enforced.

---

## 0. Orientation — what this unit actually is

Three modules, zero React scene components:

1. **`tokens.ts`** — the palette constants, the verbatim `pickNodeColor` hash from
   `AreasTree.tsx`, and `oklchToThreeColor` (manual OKLCH→sRGB — see §4, `setStyle` does NOT
   support oklch in r185).
2. **`hologram.ts`** — `makeHologramMaterial` (MeshPhysicalMaterial + fresnel emissive rim via
   `onBeforeCompile`), the **chunk-composition helper** that U-09 will use to stack its ember
   chunk on the same material family (§2 — this contract is the reason this unit has a
   pre-plan), and the `heroGlass` transmission factory with the dev-mode ≤3 registry.
3. **`sharedGeometries.ts`** — four module-level singleton geometries, constructed once at
   module scope, never disposed, never rebuilt.

No file in this unit imports React scene stuff except `hologram.ts`'s heroGlass part
(React + drei `MeshTransmissionMaterial` via `React.createElement` — see §6; the file stays
`.ts`, no JSX syntax). Nothing here runs `useFrame`, subscribes to data, or touches the DOM.

---

## 1. The fresnel rim: exact `onBeforeCompile` design

### 1.1 Why no custom varyings (important)

`MeshPhysicalMaterial`'s fragment shader **already provides everything the fresnel needs**:

- `varying vec3 vViewPosition;` is declared by `meshphysical_frag` itself (it equals
  `-mvPosition.xyz`, i.e. the vector from fragment **toward the camera** in view space).
  `viewDir = normalize(vViewPosition)`.
- A view-space `vec3 normal` local is defined by `#include <normal_fragment_begin>` /
  `<normal_fragment_maps>`, which run **before** `#include <emissivemap_fragment>` in the
  stock chunk order.

So U-03 injects **zero varyings and zero vertex-shader code**. This is deliberate and is part
of the composition contract (§2): the fewer symbols we declare, the smaller the collision
surface with U-09's chunk. Do NOT add a `vViewNormal` varying — it's redundant with `normal`
and would waste an interpolator.

### 1.2 The fragment injections (two string replaces, both keep the anchor)

Anchor rule (frozen, see §2): every injection replaces an `#include <x>` with
**the include itself + `\n` + the new chunk**, wrapped in unique marker comments. Never delete
an anchor — downstream decorators replace against the same includes.

**Injection A — uniform declarations**, anchored at `#include <common>` in the
**fragment** shader:

```glsl
#include <common>
// <studiolo:fresnel:decl>
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uRimAlphaBoost;
// </studiolo:fresnel:decl>
```

**Injection B — the rim term**, anchored at `#include <emissivemap_fragment>` in the
**fragment** shader:

```glsl
#include <emissivemap_fragment>
// <studiolo:fresnel:rim>
{
  vec3 sfViewDir = normalize( vViewPosition );
  float sfFresnel = pow( 1.0 - saturate( dot( normalize( normal ), sfViewDir ) ), uRimPower );
  totalEmissiveRadiance += uRimColor * ( uRimIntensity * sfFresnel );
  diffuseColor.a = clamp( diffuseColor.a + sfFresnel * uRimAlphaBoost, 0.0, 1.0 );
}
```

Notes, all load-bearing:

- `saturate()` comes from `<common>` — no helper needed.
- Adding to `totalEmissiveRadiance` *before* `<lights_physical_fragment>` is the canonical
  emissive path: it flows into `outgoingLight` untouched by lighting, and because the material
  is `toneMapped:false`, values > 1.0 survive to the framebuffer and trip Bloom's
  `luminanceThreshold={1}`. Face-on fragments (fresnel≈0) stay under threshold; grazing rims
  glow. That is the whole hologram trick.
- The `diffuseColor.a` boost solves the transparent-material problem: the body runs at low
  opacity (~0.14), and with normal alpha blending the rim's radiance would be multiplied by
  that alpha and die. Boosting alpha *by the fresnel term* makes edges more opaque exactly
  where they glow — the classic smoked-glass-hologram look — and keeps post-blend luminance
  above bloom threshold. Default `uRimAlphaBoost = 0.35`.
- Local names are prefixed `sf` (studiolo-fresnel) and scoped in a `{}` block: they cannot
  collide with any other chunk's locals even if another unit also uses a `viewDir`-like name.
- The whole block sits AFTER any emissive map sampling, so `emissive`/`emissiveIntensity` on
  the material still work independently as the *body* glow (used by lantern interiors).

### 1.3 The JS wiring (exact shape)

```ts
// hologram.ts
import * as THREE from "three";

export interface HologramOptions {
  tint: THREE.ColorRepresentation;
  opacity?: number;             // default 0.14
  rimColor?: THREE.ColorRepresentation;  // default = tint
  rimPower?: number;            // default 2.5
  emissiveIntensity?: number;   // body emissive, default 0.0 (rim-only glow)
  rimIntensity?: number;        // default 2.2  (>1 → blooms)
  rimAlphaBoost?: number;       // default 0.35
}

export interface HologramUniforms {
  uRimColor: { value: THREE.Color };
  uRimPower: { value: number };
  uRimIntensity: { value: number };
  uRimAlphaBoost: { value: number };
}

export function makeHologramMaterial(o: HologramOptions): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: o.tint,
    transparent: true,
    opacity: o.opacity ?? 0.14,
    roughness: 0.35,
    metalness: 0.1,
    emissive: o.tint,
    emissiveIntensity: o.emissiveIntensity ?? 0,
    toneMapped: false,
    depthWrite: false,          // transparent holograms: avoid self-occlusion artifacts
    side: THREE.FrontSide,
  });

  // Uniform objects live OUTSIDE the compile closure so callers (leva harness, U-09,
  // U-06 breath) can mutate values before AND after compilation.
  const uniforms: HologramUniforms = {
    uRimColor: { value: new THREE.Color(o.rimColor ?? o.tint) },
    uRimPower: { value: o.rimPower ?? 2.5 },
    uRimIntensity: { value: o.rimIntensity ?? 2.2 },
    uRimAlphaBoost: { value: o.rimAlphaBoost ?? 0.35 },
  };
  mat.userData.rimUniforms = uniforms;    // frozen access path (see §2 table)

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", /* Injection A string */)
      .replace("#include <emissivemap_fragment>", /* Injection B string */);
  };

  // One program per CODE variant, not per material instance. Every material this factory
  // returns shares the same key → three's WebGLPrograms compiles the fresnel program ONCE
  // (per define-permutation, see §3) and reuses it for trunk, boughs, lanterns...
  mat.customProgramCacheKey = () => "studiolo:sf@1";

  return mat;
}
```

Why `customProgramCacheKey` matters: three hashes program source partly by
`onBeforeCompile.toString()`; distinct closure instances of an identical function can defeat
the cache and recompile per material. Pinning the key to the constant string `"studiolo:sf@1"`
guarantees all fresnel materials resolve to one program (per define set). Bump the suffix
(`@2`) only if the GLSL text changes.

---

## 2. FROZEN: the chunk-composition contract with U-09 (ember-system)

U-09 needs, on the **same MeshPhysicalMaterial family**, a second injected chunk: a
per-instance `aState` attribute (state id + phase) flowing vertex→fragment to drive the gold
0.5 Hz pulse and GPU-side state tinting. Two chunks on one material = collision risk. This
section is the treaty. **Both units must honor it verbatim; changes after wave-1 freeze
require an orchestrator amendment commit (PLAN §9).**

### 2.1 Ownership decision: embers get their OWN material instance

**Frozen: U-09 does NOT share a material instance with any other family.** It calls
`makeHologramMaterial(...)` to get a fresh instance, then decorates it. Rationale: the ember
program differs (extra chunk → different program anyway), ember uniforms (`uEmberTime`)
mutate per-frame and must not touch structural materials, and instance-count-dependent state
belongs to one mesh. Sharing would buy nothing and risk everything.

### 2.2 The composition mechanism: `chainOnBeforeCompile` (exported by U-03)

`hologram.ts` exports the one sanctioned way to stack a chunk:

```ts
export function chainOnBeforeCompile(
  mat: THREE.Material,
  inject: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
  cacheKeyToken: string,        // e.g. "ember@1"
): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);   // base chunks first — ORDER GUARANTEE
    inject(shader);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|${cacheKeyToken}`;
  // → ember material key: "studiolo:sf@1|ember@1" — distinct program, still cached once.
}
```

The chain order **is** the injection order: fresnel chunks land first, ember chunks second.
Consequence (intended): U-09's pulse multiplier, applied to `totalEmissiveRadiance` after the
rim was added, scales rim + body together — the whole ember breathes, not just its core.

### 2.3 Frozen interface table

| Item | Owner | Name (exact) | Type / layout | Notes |
|---|---|---|---|---|
| Rim color uniform | U-03 | `uRimColor` | `vec3` | frag only |
| Rim exponent | U-03 | `uRimPower` | `float` | default 2.5 |
| Rim HDR intensity | U-03 | `uRimIntensity` | `float` | >1 blooms |
| Rim alpha boost | U-03 | `uRimAlphaBoost` | `float` | default 0.35 |
| Uniform access path | U-03 | `material.userData.rimUniforms` | `HologramUniforms` | mutate `.value` only |
| Ember state attribute | U-09 | `aState` | `InstancedBufferAttribute`, itemSize **2**: `x` = state id, `y` = phase offset ∈ [0, 2π) | vertex |
| State id encoding | frozen here | `0=ambient · 1=today · 2=overdue · 3=ascending` | float compared with `< 0.5` steps | MUST match `EmberState` union order in U-04 `mappings.ts` |
| Ember varying | U-09 | `vEmberState` | `varying vec2` | vertex→frag |
| Ember clock | U-09 | `uEmberTime` | `float` seconds | advanced only in demanded frames (pulse freezes when world sleeps — intended, PLAN U-09) |
| Marker comments | both | `// <studiolo:fresnel:*>` (U-03), `// <studiolo:ember:*>` (U-09) | — | greppable, and guards against double-injection |

### 2.4 Frozen anchor map (who replaces which `#include`)

| Shader | Anchor | U-03 | U-09 |
|---|---|---|---|
| vertex | `#include <common>` | **never touches vertex** | appends `attribute vec2 aState; varying vec2 vEmberState;` |
| vertex | `#include <begin_vertex>` | — | appends `vEmberState = aState;` + optional overdue y-drop on `transformed` |
| fragment | `#include <common>` | appends rim uniform decls | appends `varying vec2 vEmberState; uniform float uEmberTime;` |
| fragment | `#include <emissivemap_fragment>` | appends rim block (Injection B) | appends pulse block **after** (chain order) |

Rules both sides obey: (1) always `replace(include, include + "\n" + chunk)` — the anchor
survives for the next decorator; (2) declare only names from the table; (3) locals inside
`{}` blocks with `sf`/`em` prefixes; (4) never inject into any other chunk anchor without an
amendment. U-03's guarantee that it never writes vertex code means U-09 owns the vertex shader
outright — no coordination needed there.

(Pulse math itself — the exact `mix(1.6, 2.6, …)` @0.5 Hz waveform, the overdue drop —
belongs to U-09's own pre-plan. U-03 only freezes the plumbing above.)

---

## 3. The variant list (≤6 programs) and how the budget is counted

The §7 budget counts **compiled WebGL programs**, not material instances. `customProgramCacheKey`
makes N material instances share 1 program when their injected code is identical. Three still
forks a program per *define permutation* (e.g. `USE_INSTANCING`, `USE_INSTANCING_COLOR` are set
per-object) — that forking is what the list below already accounts for. The frozen inventory:

| # | Variant (program) | Base | Used by | Cache key |
|---|---|---|---|---|
| 1 | Fresnel hologram, non-instanced | `MeshPhysicalMaterial` | trunk, dais, bough limbs (U-06) | `studiolo:sf@1` |
| 2 | Fresnel hologram, instanced + instanceColor | same material family via drei `<Instances>` (defines fork it) | lanterns (U-10) | `studiolo:sf@1` (+ instancing defines) |
| 3 | Fresnel + ember chunk, instanced | #1 decorated via `chainOnBeforeCompile` | embers AND taper filaments — **one material instance shared by both InstancedMeshes** (U-09) | `studiolo:sf@1\|ember@1` |
| 4 | Raw glow (stock) | `MeshBasicMaterial({ toneMapped:false })`, color pushed >1 | bough core filaments & sap strip (U-06), fireflies (U-14), Jarvis ring (U-13) | stock (no custom key) |
| 5 | Hero transmission | drei `MeshTransmissionMaterial` | focused lantern, Jarvis ribbon, +1 reserve (≤3 live) | drei-managed |
| 6 | — reserve — | unallocated | headroom for Phase-1 surprises | — |

Enforcement guidance for the executor:

- Do NOT create per-tint materials. Tint varies by **uniform value** (`color`, `uRimColor`) or
  **per-instance `instanceColor`**, never by new GLSL. Six areas ≠ six programs.
- The lantern faceted look comes from geometry-baked flat normals (§5), NOT
  `flatShading:true` — `flatShading` is a define and would fork a 7th program.
- `MeshBasicMaterial` instances for different glow colors are free (one stock program); create
  as many instances as needed, but reuse where color matches.
- Acceptance probe: after mounting the U-03 dev harness scene, `renderer.info.programs.length`
  attributable to this layer ≤ 6.

---

## 4. `oklchToThreeColor` — verified: manual conversion required

**Verified 2026-07-06:** three r185 `Color.setStyle` parses only hex, `rgb()`/`rgba()`,
`hsl()`/`hsla()`, and X11 names (official docs; issue #33195 confirms anything else is a
*silent no-op* — the color keeps its previous value, the worst failure mode). PR #33043 adds
OKLCH helpers but on `ColorConverter`, not `setStyle`, and is not in r185. **Do not call
`setStyle` with an oklch string — implement the conversion manually.**

### 4.1 Input grammar

The only producers are the six `NODE_PALETTE` strings, shape `oklch(72% 0.13 210)`:
L as percentage, C absolute, H degrees, space-separated, no alpha. Parse with:

```ts
const OKLCH_RE = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i;
// L = m[2] === "%" ? +m[1] / 100 : +m[1];  C = +m[3];  H = +m[4] (degrees)
```

Throw on no-match in dev (`if (process.env.NODE_ENV !== "production") throw`), return
`new THREE.Color(1,1,1)` in prod — never the silent-stale-color failure three itself has.

### 4.2 The math (Björn Ottosson's reference OKLab transform — copy exactly)

```
1. a = C · cos(H·π/180);  b = C · sin(H·π/180)          // OKLCH → OKLab
2. OKLab → LMS' (cone response, cube-root domain):
     l_ = L + 0.3963377774·a + 0.2158037573·b
     m_ = L − 0.1055613458·a − 0.0638541728·b
     s_ = L − 0.0894841775·a − 1.2914855480·b
3. Cube: l = l_³ ;  m = m_³ ;  s = s_³
4. LMS → LINEAR sRGB:
     r = +4.0767416621·l − 3.3077115913·m + 0.2309699292·s
     g = −1.2684380046·l + 2.6097574011·m − 0.3413193965·s
     b = −0.0041960863·l − 0.7034186147·m + 1.7076147010·s
5. Gamut: clamp each channel to [0,1]. (All six palette entries are in-gamut pastels;
   the clamp is a safety net, not a corrector — no CSS-4 gamut mapping needed.)
```

Step 4's output is **linear** sRGB — exactly three's working color space. Therefore:

```ts
color.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
```

Do NOT route through `setRGB(..., SRGBColorSpace)` or a hex string — that would apply an
sRGB→linear EOTF to already-linear values and darken every hue.

### 4.3 Caching

Module-level `Map<string, THREE.Color>` keyed by the raw string; `oklchToThreeColor` returns
**`cached.clone()`** (callers like U-06 mutate colors for HDR scaling — handing out the cached
instance would corrupt the cache). Six palette strings → six cache entries; clone cost is
negligible at layout cadence.

### 4.4 Dev sanity check (put in the harness, not shipped code)

`oklch(72% 0.13 210)` (brand cyan) should land near sRGB `#5cb4cf`-ish (linear ≈ 0.10/0.45/0.62).
Eyeball against the 2D `/areas` branch strokes — PLAN's acceptance is "boughs match 2D tree
colors exactly", and this function is the entire mechanism.

---

## 5. `sharedGeometries.ts` — exact constructors, perf-budgeted

Module-level `const` singletons. Created once at import, **never disposed** (lifetime = the
world island), **never rebuilt**, never constructed inside a component or `useFrame`. Sizing
is frozen here so consumers scale via instance matrices, never via new geometry.

```ts
import * as THREE from "three";

// Task embers — U-09 InstancedMesh, cap 1024.
// SphereGeometry(radius, widthSegments, heightSegments) = (0.03, 8, 6) → 80 tris.
// Worst case 1024 × 80 = 81.9k tris; realistic 300 tasks = 24k. Fits §7's 300k ceiling.
export const EMBER_GEOMETRY = new THREE.SphereGeometry(0.03, 8, 6);

// P∞/P1 priority filaments — U-09 second InstancedMesh, cap 128.
// Open-ended cone: (radiusBottom 0.008, height 0.12, radialSegments 6, heightSegments 1,
// openEnded true) → 12 tris. 128 × 12 = 1.5k tris. Instance scale.y ×2.2 per the grammar;
// translate geometry +0.06 in Y at module init (geometry.translate(0, 0.06, 0)) so the
// cone's BASE sits at the instance origin and scale.y grows the flame upward.
export const TAPER_GEOMETRY = new THREE.ConeGeometry(0.008, 0.12, 6, 1, true);
TAPER_GEOMETRY.translate(0, 0.06, 0);

// Project lanterns — U-10 <Instances limit={256}>.
// Icosahedron detail 0 = 20 faces. Faceted look baked GEOMETRY-side (not flatShading —
// that forks a shader program, §3): toNonIndexed() gives each face unique verts, then
// computeVertexNormals() on unindexed tris yields flat face normals. 20 tris × 256 = 5.1k.
export const LANTERN_GEOMETRY: THREE.BufferGeometry =
  new THREE.IcosahedronGeometry(0.16, 0).toNonIndexed();
LANTERN_GEOMETRY.computeVertexNormals();

// Capture fireflies — U-14 InstancedMesh, cap 64.
// (0.02, 6, 4) → 40 tris. 64 × 40 = 2.6k.
export const FIREFLY_GEOMETRY = new THREE.SphereGeometry(0.02, 6, 4);
```

Total worst-case contribution of every instanced family: ≈ 91k triangles — under a third of
the §7 300k budget, leaving room for trunk/boughs/floor/text.

SSR note: constructing geometries touches no DOM, so module import is technically SSR-safe,
but the file lives under `components/world/**` behind the `ssr:false` island (U-02) and must
stay there — never import it from 2D code (it would drag `three` into 2D bundles, violating
the §7.9 code-split acceptance).

---

## 6. `heroGlass` — the ≤3 dev registry

### 6.1 Design

`MeshTransmissionMaterial` costs an extra scene render pass per live instance (TECH.md §2).
Budget: **3** (focused-lantern swap, Jarvis ribbon, one reserve). Enforcement must track
*live mounted* instances — a counter of calls is wrong (the hero lantern swap mounts/unmounts
repeatedly). So the registry hooks React lifecycle:

```ts
// hologram.ts — no JSX syntax; the file stays .ts, use React.createElement.
import { createElement, useEffect, type JSX } from "react";
import { MeshTransmissionMaterial } from "@react-three/drei";

const HERO_GLASS_CAP = 3;
const liveHeroGlass = new Set<symbol>();

function registerHeroGlass(): () => void {
  if (process.env.NODE_ENV === "production") return () => {};   // no-op path, zero cost
  const token = Symbol("heroGlass");
  liveHeroGlass.add(token);
  if (liveHeroGlass.size > HERO_GLASS_CAP) {
    liveHeroGlass.delete(token);
    throw new Error(
      `[studiolo] heroGlass cap exceeded: ${HERO_GLASS_CAP} MeshTransmissionMaterial ` +
      `instances are already live (PLAN §7.7). Use makeHologramMaterial for this object.`,
    );
  }
  return () => { liveHeroGlass.delete(token); };
}

function HeroGlassMaterial({ tint }: { tint: string }): JSX.Element {
  useEffect(registerHeroGlass, []);      // register on mount, unregister on unmount
  return createElement(MeshTransmissionMaterial, {
    transmission: 1, thickness: 0.35, ior: 1.2, roughness: 0.15,
    chromaticAberration: 0.04, backside: true, color: tint,
  });
}

// PLAN §6 signature preserved: heroGlass(o) returns a JSX element.
export function heroGlass(o: { tint: string }): JSX.Element {
  return createElement(HeroGlassMaterial, { key: undefined, ...o });
}
```

Design points:

- **Dev throw, prod no-op:** `process.env.NODE_ENV` branch is statically eliminated by the
  bundler in prod; the Set and Symbol machinery never allocates in production. The throw
  happens in a mount effect, so it surfaces loudly in the dev overlay/error boundary the
  moment a 4th instance mounts — including transient double-mounts under React StrictMode
  (StrictMode's mount→unmount→mount runs the cleanup, so a legitimate 3 never false-positives;
  note this in a comment).
- The `useEffect` cleanup is the unregister — a hero lantern swap that unmounts frees its slot
  before the next focus mounts a new one.
- Transmission props are frozen from PLAN §6 (`transmission=1 thickness=0.35 ior=1.2
  roughness=0.15 chromaticAberration=0.04 backside`); `color` is the only caller knob.
- Acceptance hook: the dev harness mounts 4 → expect the throw.

---

## 7. Full export signatures + build checklist

### 7.1 `tokens.ts`

```ts
import * as THREE from "three";

// VISION §5 palette, verbatim hex:
export const STUDIOLO = {
  nightwalnut: "#120E0B", deepVellum: "#0E1420", parchment: "#F2E9D8",
  sepiaInk: "#4A3B2A",    brass: "#C9A227",      candleflame: "#E8C46B",
  emberAlarm: "#FF6B4A",  jarvisCyan: "#5FD0FF", fireflyCyan: "#8FE8FF",
  verdigris: "#4FA487",   moonlace: "#8FA8C7",
} as const;
export type StudioloToken = keyof typeof STUDIOLO;

// Copied VERBATIM from apps/web/components/areas/AreasTree.tsx lines 57–70.
// Do not "improve" the hash — 2D/3D color identity is a Phase-1 acceptance criterion.
export const NODE_PALETTE = [
  "oklch(72% 0.13 210)", // cyan (brand)
  "oklch(74% 0.14 350)", // pink
  "oklch(72% 0.14 305)", // purple
  "oklch(74% 0.13 175)", // turquoise
  "oklch(76% 0.15 155)", // mint / light green
  "oklch(80% 0.13 70)",  // amber / peach
] as const;

export function pickNodeColor(id: string): string;
// djb2, copied verbatim:
//   let h = 5381;
//   for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
//   return NODE_PALETTE[Math.abs(h) % NODE_PALETTE.length];

export function oklchToThreeColor(oklch: string): THREE.Color;   // §4 — returns a clone
```

(Leave `AreasTree.tsx` untouched — copy, don't import; the 2D component must not become a
dependency of the 3D bundle or vice versa. A one-line provenance comment pointing back at
`AreasTree.tsx` is required so future edits know to keep them in sync.)

### 7.2 `hologram.ts`

```ts
export interface HologramOptions { /* §1.3 */ }
export interface HologramUniforms { /* §1.3 */ }
export function makeHologramMaterial(o: HologramOptions): THREE.MeshPhysicalMaterial;
export function chainOnBeforeCompile(
  mat: THREE.Material,
  inject: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
  cacheKeyToken: string,
): void;                                                          // §2.2 — U-09's hook
export function heroGlass(o: { tint: string }): JSX.Element;      // §6
```

### 7.3 `sharedGeometries.ts`

```ts
export const EMBER_GEOMETRY: THREE.SphereGeometry;      // (0.03, 8, 6)
export const TAPER_GEOMETRY: THREE.ConeGeometry;        // (0.008, 0.12, 6, 1, true), +0.06y
export const LANTERN_GEOMETRY: THREE.BufferGeometry;    // Icosahedron(0.16, 0) non-indexed, flat normals
export const FIREFLY_GEOMETRY: THREE.SphereGeometry;    // (0.02, 6, 4)
```

### 7.4 Ordered build checklist (commit per step, explicit pathspecs)

1. **`tokens.ts`** — palette const, verbatim `NODE_PALETTE` + `pickNodeColor` copy,
   `oklchToThreeColor` (§4 parse + matrices + cache + dev-throw). Vitest: hash parity with a
   fixture of 5 real-looking ids against the copied 2D function; oklch parse of all 6 palette
   strings produces finite in-[0,1] RGB. → commit.
2. **`hologram.ts` part 1** — GLSL chunk strings (Injection A/B with marker comments),
   `makeHologramMaterial` with uniforms-outside-closure + `customProgramCacheKey`. → commit.
3. **`hologram.ts` part 2** — `chainOnBeforeCompile` (§2.2) + the §2 contract table copied
   into the file's doc comment (it is the treaty text U-09's executor will read). → commit.
4. **`hologram.ts` part 3** — `heroGlass` + dev registry (§6). → commit.
5. **`sharedGeometries.ts`** — four singletons exactly as §5 (including the taper translate
   and lantern non-indexed flat normals). → commit.
6. **Dev harness** (throwaway page or story under a dev-only flag, not shipped): 500-instance
   InstancedMesh with the hologram material + Bloom composer — verify ≤3 draw calls
   (`gl.info.render.calls`), bloom only on rims, leva sliders bound to
   `material.userData.rimUniforms.*.value`; mount a 4th `heroGlass` → observe the throw.
   Record numbers in the commit message. → commit.

### 7.5 Acceptance (from PLAN §6 U-03, restated as testable)

- 500 hologram instances render in ≤3 draw calls; halos appear only where fresnel pushes
  radiance > 1 (a stock `MeshStandardMaterial` control object in the harness must NOT glow).
- Program count from this layer ≤ 6 (§3 table).
- 4th live `heroGlass` throws in dev; prod path is a no-op.
- `pickNodeColor` output is bit-identical to `AreasTree.tsx` for the same ids.
- `oklchToThreeColor` never silently no-ops (dev-throws on malformed input).

---

*— Fable. Contract §2 is frozen at wave-1 close; U-09's pre-plan builds on it, not around it.*
