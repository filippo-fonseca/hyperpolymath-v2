# LifeOS: THE STUDIOLO
### A creative vision for the world you will live in

> *"I'm tired of dashboards. I want a world."*
>
> This document is the creative north star for the LifeOS reinvention. It is opinionated,
> specific, and cinematic on purpose. The tech rails live in `TECH.md`; the code reality in
> `CODEBASE-MAP.md`. This file is the dream — kept just barely inside what those two allow.

---

## 1. THE BIG IDEA

**The Studiolo.** In the Renaissance, a studiolo was a prince's private study — a small,
candle-lit chamber lined with intarsia wood and astronomical instruments, where one person sat
at the center of everything they knew and ruled. Federico da Montefeltro had one. Leonardo
sketched in one. Yours is different in exactly one way: **it is the size of a cathedral, it is
made of night, and it is alive.** The Studiolo is a first-person holographic chamber — a
Renaissance study rebuilt as a starship command deck — where your entire life grows out of the
floor as a single **living Tree of brass and light**. Areas are its boughs. Projects hang in its
branches like glass lanterns. Tasks burn inside them as embers. Captures drift through the dark
as fireflies looking for a branch to land on. Your calendar wheels overhead as a slow golden
meridian, like the day itself rendered as an astronomical instrument. And somewhere in the warm
dark, always, is **Jarvis** — a small ring of cyan light that flies to your shoulder when you
speak. You don't *check* this world. You *inhabit* it. It is the difference between reading a
weather report and standing in the wind.

**One sentence:** *The Studiolo is a candle-lit holographic observatory of your life, where a
living tree of glass and brass grows everything you are responsible for — and a voice in the
dark helps you tend it.*

---

## 2. THE SPATIAL METAPHOR — the Tree is the world

The single load-bearing decision: **the Areas hierarchy is not rendered *in* the world — the
Areas hierarchy IS the world's geography.** Everything else hangs off it.

### The layout

Imagine a vast circular chamber, floor of dark polished walnut with faint inlaid brass
meridian lines (an homage to the intarsia studiolo), walls dissolving into deep indigo night
speckled with faint dust motes. No visible ceiling — the room opens upward into darkness where
the **Meridian Ring** (your calendar, §3) turns slowly.

At the center of the floor stands **the Tree**:

- **The Trunk** rises from a circular brass dais — this is *you*, the root of `getSidebarTree`.
  Warm parchment-gold light runs up its bark like slow sap.
- **The Boughs** are your top-level **Areas** — School, Health, Projects, Life — each one a
  massive limb sweeping out into its own quadrant of the chamber, each carrying its
  deterministic OKLCH hue from today's 2D tree (that per-area color hash is a keeper — it
  becomes each bough's *light signature*).
- **Sub-areas** are branches off the bough; **the tree's fractal depth is your hierarchy's
  depth.** Deep nesting reads as literal distance from the trunk — your life's periphery is
  *physically peripheral*.
- Each bough terminates in an **Alcove** — a curved study-nook carved out of the chamber wall
  in that area's light, with its own desk, its own pinboard, its own weather. School's alcove
  glows amber and is stacked with class-lanterns; Health's is cooler, sparser, breathing
  slowly.

**Navigation = arboreal travel.** You never teleport between unrelated screens. You *glide
along branches*. Going from a School task to a Health habit means pulling back to the trunk and
swinging out along a different bough — a 1.5-second camera arc that keeps your mental map
intact. The information architecture and the physical architecture are the same object. That is
what "the areas tree becomes the spatial spine" means: **breadcrumbs are replaced by the branch
you can see behind you.**

### The Home view — "the Vestibule"

When you enter, you are standing on the brass dais at trunk-height, about four meters back,
looking slightly up at the Tree filling your view. This is the money shot:

- The Tree, softly luminous, every bough color-coded, embers of today's tasks pulsing in the
  near branches.
- The Meridian Ring overhead, your next event burning brightest at its zenith arrow.
- Three or four **fireflies** (unfiled captures) drifting lazily near the trunk, waiting.
- Bottom-center, low and unobtrusive: **the Ledger** — a single strip of EB Garamond text like
  the opening line of a journal entry: *"Monday, July 6th. Four tasks due. Lecture at two.
  One thought you haven't filed."*
- And the **Jarvis ring** idling at your right shoulder's edge of view, breathing.

You can *do* everything from here with one sentence to Jarvis. Everything else is for when you
want to walk.

---

## 3. HOW EACH DATA TYPE MANIFESTS

Every object obeys one law: **state is light.** You should be able to squint from the dais and
know how your life is going purely from the color temperature of the room.

### Areas → **Boughs & Alcoves**
- Physical form: massive branch limbs of dark bronze-glass with a filament of the area's OKLCH
  hue running through the core, like a vein of light in smoked amber.
- An area's *load* reads as luminous density: a bough carrying many active projects glows
  denser and hums faintly; a dormant area dims to ember-bronze.
- Archived areas petrify — grey bark, no light, still beautiful. Your history stays part of
  the tree's silhouette. (Data: `SidebarArea` from `getSidebarTree`, exactly as today.)

### Projects (incl. classes) → **Lanterns**
- Physical form: faceted glass lanterns hanging from their bough — think the floating orb in
  the glass cube from the reference set, shrunk and multiplied. Each lantern's glass is tinted
  by its parent area; the light inside is the project's own life.
- **Classes** get a distinguishing brass armature — a small orbital ring around the lantern
  (course code engraved on the ring in tiny Garamond caps). Instantly readable: ringed lantern
  = class.
- Progress is fuel: a project nearly done burns high and clean; a stalled one gutters, flame
  low and blue. A project past its end date smokes faintly. Open a lantern (focus in) and it
  unfolds into the **Project Mode workbench** (§6, Hero Moment 4) — the exploded arc-reactor
  schematic energy from the reference cutting-mat image.

### Tasks → **Embers**
- Physical form: small warm-white motes clustered inside and around their project lantern —
  instanced meshes, hundreds cheap (per TECH.md §7, one `InstancedMesh` + springs).
- **State at a glance, non-negotiable grammar:**
  - **Due today** → ember pulses at ~0.5Hz breathing rhythm, warm gold `#E8C46B`.
  - **Overdue** → ember reddens to `#FF6B4A` and *drops half out of its lantern*, hanging
    visibly wrong, like a coal fallen from a grate. Overdue work should be physically
    uncomfortable to look at. Three overdue embers tint their whole lantern's glass hot.
  - **Done (`lesno`)** → the ember goes up: a brief bright flare, then it rises off the tree
    as a spark and dissolves into the dark overhead with a soft chime. Completing a task is
    literally *releasing a light into the night*. This animation is sacred. Never cheapen it.
  - **P∞ / P1 priority** → the ember carries a thin vertical filament of light, a taper flame
    rather than a mote; taller flame = higher priority.
- At distance, tasks LOD down to pure glow contribution (no labels); walk close and titles
  fade in as SDF Garamond captions beside each ember.

### Quick Captures → **Fireflies**
- Physical form: tiny cyan-white motes `#8FE8FF` with slow erratic drift, unattached to the
  Tree — because that's what a capture *is*: a thought that hasn't found its branch.
- They loiter near the trunk in a loose swarm. Their count is your inbox pressure — one or two
  is charming; fifteen is a visible cloud of unfinished thinking, gently nagging.
- Filing a capture (via Jarvis or drag) makes the firefly *fly* — a curving, dragonfly-quick
  flight along the correct bough to its destination lantern, where it lands and cools into an
  ember (if it became a task) or presses itself into the lantern's glass as a small inscribed
  note. **This flight is the visual proof of the core product promise: one sentence in, the
  right thing lands in the right place — and you literally watch it land.**

### Google Calendar → **the Meridian Ring**
- Physical form: a great slow-turning brass-and-glass annulus overhead, canted like an
  armillary sphere's ecliptic — the day as an astronomical instrument. It never touches the
  Tree (calendar lives only in GCal; the ring is pure projection — matching the architecture).
- The ring is a 24-hour dial. **Now** is always at the zenith, marked by a hanging plumb-line
  of light that falls from the ring down toward the trunk. Events are **glass tablets** riveted
  to the ring, sized by duration, colored parchment-neutral until they belong to an area/class
  (then they take that bough's hue).
- Time physically approaches you: your 2pm lecture slides toward zenith all morning. Fifteen
  minutes out, its tablet begins to chime softly and leans down out of the ring toward your
  eyeline. Past events swing behind you, dim to sepia, and read like a journal of the day
  already written.
- Look up and sweep two fingers: the ring spins forward through tomorrow, the week, the month
  — days flickering past like a zoetrope (§6, Hero Moment 5).

### Jarvis → **the Ring of the Familiar**
- Physical form: a small concentric-ring sigil of cyan light `#5FD0FF` — the arc-reactor
  lineage from the reference images, but drawn thin and precise, like an astronomer's
  instrument rather than a weapon core. At idle it rests low in your peripheral vision,
  breathing at 12 breaths/minute.
- When summoned it flies to center-view and *unrolls* — the rings open into a horizontal
  parchment ribbon (the input line) with the ring as its wax seal on the left. Speech makes
  the rings ripple concentrically with your voice's amplitude; thinking is a slow interior
  orbit of three motes (the v1 "thinking word" reborn as motion); tool actions each fire a
  visible thread of light from the ring to the object being changed. **When Jarvis creates a
  task in School, you see the light travel to the School bough.** The agent's actions are
  never invisible.

---

## 4. INTERACTION MODEL — laptop-first, comfort-first

Per TECH.md: **guided flight, not free-look FPS.** This is a MacBook instrument, not a shooter.

### Moving through the world
- **Click any object → glide.** Every bough, lantern, alcove and tablet is a fly-to target
  (`CameraControls.setLookAt`, ~700ms ease-out). Click a bough: you swing along it. Click a
  lantern: you arrive at reading distance, lantern centered, world softly defocused behind.
- **Scroll/pinch = altitude.** Two-finger scroll pulls you up the trunk toward canopy overview
  (the whole life at once, Meridian Ring at eye level) or down into the roots (settings,
  archive — the cellar of the studiolo). Pinch zooms toward whatever you're facing.
- **Two-finger drag = orbit** around your current focus, damped, always returning level.
- **Esc = pull back one level** — lantern → bough → trunk → Vestibule. Esc is your ariadne
  thread; mash it thrice from anywhere and you're home on the dais. Muscle memory in a day.
- **Keyboard spine (for the keyboard-first soul):** `1–9` fly to areas in tree order; `T`
  fly-to today's cluster; `G` then a letter = go-to (Vim-style); `Tab`/`Shift-Tab` walk
  siblings on the current branch; arrow keys nudge orbit. Optional WASD free-walk exists
  behind a toggle for the days you just want to wander your own life — off by default,
  vignette-on-move, no head-bob, per the comfort research.

### Hands on holograms
- **Hover** = the object leans toward you 2–3°, emissive lifts 20%, a one-line Garamond
  caption fades in. The world should feel like it *notices you back*.
- **Grab & throw panels:** any open panel (a project's task list, a capture ribbon) is a
  holographic card you can grab with a click-drag and fling; it glides on a spring and settles
  upright (billboarded), parked where you left it. You can dress your alcove with pinned
  panels like maps on a war-room table — your arrangement persists.
- **Swipe stacks:** sibling panels (this week's days, a class's assignments) stack like a
  card deck; horizontal swipe pages them with the throw-and-settle physics of a well-weighted
  rolodex.
- **Focus ritual:** double-click any object to *enter* it — camera dolly-in, depth-of-field
  blooms, the rest of the Tree dims to constellation outlines, and the object unfolds. Esc
  folds it back. One gesture, one meaning, everywhere.

### Summoning Jarvis
- **`Cmd+K`** (kept from the current app) or **just start typing anywhere** — the ring flies
  in, ribbon unrolls, your keystrokes land in it. Zero-friction capture is the whole religion.
- **Hold `Space` to speak** (push-to-talk) or say the wake word on the desktop app — the ring
  ripples while you talk, and the SSE stream (`POST /api/jarvis`) renders as ink writing
  itself onto the ribbon in real time, with each executed action firing its thread of light
  into the world.
- Jarvis's clarifying questions appear as the ribbon folding into a small choice-card — never
  a modal, never a blocking dialog. The world keeps breathing behind it.

---

## 5. AESTHETIC BIBLE

**The one-line brief: candlelight in a planetarium.** Warm Renaissance materials below, cold
astronomical light above, and the holograms living in between. Never the all-cyan Iron-Man
clone — our HUD drinks from a warmer well.

### Palette (name them, use them, defend them)
| Name | Hex | Role |
|---|---|---|
| **Nightwalnut** | `#120E0B` | The chamber's dark — warm near-black, never pure black |
| **Deep Vellum** | `#0E1420` | Upper darkness / sky gradient the chamber dissolves into |
| **Parchment** | `#F2E9D8` | Primary text, panel "paper," the Ledger |
| **Sepia Ink** | `#4A3B2A` | Secondary text, engraved captions, ruled lines |
| **Studiolo Brass** | `#C9A227` | Structural metal: dais, armatures, the Meridian Ring |
| **Candleflame** | `#E8C46B` | Today, active, alive — the default warm glow |
| **Ember Alarm** | `#FF6B4A` | Overdue, urgent — the only aggressive color in the world |
| **Jarvis Cyan** | `#5FD0FF` | The agent, captures, anything *intelligent or unfiled* |
| **Verdigris** | `#4FA487` | Done/complete accents, growth, the moss of finished things |
| **Moonlace** | `#8FA8C7` | Distant/inactive UI, constellation outlines, dimmed state |

Rule of thumb: **brass & candle for what exists, cyan for what thinks, ember for what's wrong,
verdigris for what's finished.** Area hues (the OKLCH hash) sit *on top* of this base like
stained glass over candlelight.

### Materials
- **Smoked amber glass** (cheap fresnel-rim hologram recipe from TECH.md §2) for the panel
  fleet; reserve true `MeshTransmissionMaterial` for exactly the hero objects: the focused
  lantern, the Jarvis ribbon, one Meridian tablet at zenith.
- **Dark walnut + brass inlay** floor (a single good PBR texture set; the intarsia lines are
  emissive-brass strips that carry light to each alcove like circuitry disguised as
  marquetry).
- **Paper that glows:** panels read as sheets of parchment lit from within — paper texture,
  deckled edge alpha, faint ruled lines — not sci-fi glass rectangles. The Notion/journal DNA
  survives as *luminous paper*.

### Light & atmosphere
- One warm key light low over the dais (the "candle"), cool fill from the Ring above,
  `Environment` night HDRI at low resolution for the glass to drink. Volumetric restraint:
  a single god-ray shaft down the plumb-line of *now*, dust motes (one cheap particle system)
  drifting through it. Bloom (`luminanceThreshold=1`) is the only glow engine — if it should
  glow, push it HDR; nothing else blooms. Vignette at 0.4/0.6 for the lens feel.

### Typography in 3D
- **EB Garamond is the voice of the world** — all world-space captions, the Ledger, lantern
  names, ring engravings, via SDF `<Text>` with generous `sdfGlyphSize` so the serifs stay
  crisp. Italic Garamond for Jarvis's written replies (the familiar writes in a humanist
  hand). JetBrains Mono appears *only* inside focused editing panels — the instrument
  readout, never the prose. Numerals on the Meridian Ring are engraved brass Garamond
  old-style figures. **No geometric sans anywhere in the world.** The serif in hologram light
  is the brand fusion — protect it.

### Motion language
- Everything arrives by **unfolding or growing**, never by popping: panels unroll like
  scrolls (200ms), lanterns bloom open like time-lapse flowers (350ms), the camera always
  *eases* (600–900ms fly-tos). Idle motion is **breath**: 0.2Hz luminance sway on the Tree,
  slow Ring rotation, firefly drift — the world is alive but never busy. Springs everywhere
  (`@react-spring/three`), overshoot small (1.04 max), damping high. `prefers-reduced-motion`
  collapses all of it to crossfades, honestly and completely.

### Sound design sketch
- **Room tone:** a barely-audible warm hum, C2 drone + faint vinyl crackle — a candle-lit
  server room. Ships muted-by-default until first gesture (browser rules anyway); a brass
  toggle on the dais.
- **Chimes (all in one pentatonic family so nothing clashes):**
  - Task done → a single struck **glass bell** with long verdigris decay (the spark ascends
    on this note).
  - Capture caught → a soft **quill-scratch + cork pop**, tiny.
  - Firefly lands / Jarvis routes something → **two-note ascending chime**, cyan-bright.
  - Event at T-15min → the Meridian Ring **tolls once**, low brass, positional audio from
    above (drei `PositionalAudio` — the reminder literally comes from overhead).
  - Overdue tick-over → a low **wooden knock**, once, not repeated. Guilt, not nagging.
- **Jarvis voice:** the existing TTS pipeline, mixed with a faint room reverb so it sounds
  *in the chamber*; the ring's ripple is amplitude-linked so voice and light are one gesture.
- **Travel:** fly-tos get a soft air-swell (white noise, band-passed, 300ms) — the sound of
  moving through a big quiet room.

---

## 6. HERO MOMENTS

### I. The Morning Boot-Up — *"the Litany"*
You open the lid at 7:40. The chamber is dark — true dark — except one candle-point of light
on the dais. Then the Studiolo *wakes for you*: brass inlay lines light up in sequence across
the floor like a cathedral's aisle lamps, racing outward from your feet to each alcove. The
Tree fades up bough by bough — School first (it knows your Monday), then Projects, then
Health — each igniting with a soft chord. The Meridian Ring swings up out of the darkness
overhead, today's tablets riveted and waiting, your 2pm lecture already gleaming. Fireflies
you left unfiled last night blink awake and resume their drift. And the Ledger writes itself
across the bottom in Garamond italic, letter by letter, as Jarvis reads it aloud in the
chamber's warm reverb: *"Good morning. Monday, July 6th. Four tasks due — two in Distributed
Systems. Your first event is at two. One thought from last night still unfiled: 'ask Ana about
the eval harness.' Shall I make it a task?"* You say "yes, P2, this week" — and watch a cyan
thread leap from the ring to the School bough, where a new ember kindles. Boot-up to first
action: eleven seconds. You haven't touched the keyboard.

### II. Catching a Thought — *"the Firefly"*
It's 3pm, you're deep in something else entirely, and a thought arrives — *email the prof
about the extension*. You hit `Cmd+K` without looking. The ring flies in, ribbon unrolls, you
type nine words, hit Enter. Cork-pop. A new firefly blinks into being at the trunk — and
before it even finishes materializing, Jarvis has read it: the firefly banks, accelerates,
threads along the School bough in a bright half-second arc, and lands on the Distributed
Systems lantern, cooling from cyan to candle-gold as it becomes a task, due Friday, inferred
from "before the deadline." Two-note chime. The whole exchange took four seconds and your
eyes never had to leave the thought. This is the core value — *one sentence lands in the
right place* — made so physical you could point to where it landed.

### III. Planning the Week — *"the Cartographer's Table"*
Sunday evening. You press `W` and the world reconfigures: the camera rises to canopy height,
the Tree gently flattens its near branches, and a great holographic **chart table** unrolls
between you and the trunk — seven parchment columns, Monday to Sunday, ruled in sepia ink like
a ledger page from 1490. Every unscheduled ember on the Tree lifts slightly, candidate-bright.
You grab one — *finish the eval harness* — and its filament stretches as you drag it over the
table; Thursday's column glows to receive it, and when you drop, the Meridian Ring far above
quietly rivets a matching tablet into Thursday's arc. Glass-bell tick. You deal the week out
like a hand of cards, Jarvis countering aloud — *"Thursday holds three deep-work tasks
already; Wednesday is empty until noon"* — and the columns subtly warm or cool with load as
you go, the whole table a living heat-map of your intention. When you're done you sweep both
hands (two-finger swipe) and the table rolls itself up like a scroll and stows in the trunk.
The week is planned, and it felt like cartography, not data entry.

### IV. Entering the Forge — *"Project Mode"*
You double-click the *Hyperpolymath v2* lantern. The camera dives; the rest of the Tree dims
to moonlace constellation lines; the lantern swells and then **unfolds** — glass petals
opening outward until you're standing inside a workshop the size of a small room, the
project's guts arrayed around you like the exploded arc-reactor schematic from a master's
workbench. Tasks hang as embers in kanban constellations (todo / doing / done, left to
right); the project's captures are pressed into a glass pinboard wall like specimens; linked
calendar events form a small private meridian arc overhead showing this project's next
deadline sliding toward you. Dead center: the workbench panel — a real editor (a genuine DOM
panel, because typing deserves a real caret) where notes and task details open at full
fidelity. Everything else in your life is still *there* — dim constellation lines through the
glass — but it has the decency to be quiet. You work. When an ember goes verdigris and
ascends past your shoulder with its bell-note, inside the forge, at close range — it feels
like promotion, not completion.

### V. The Sweep of Days — *"the Zoetrope"*
You look up (press `C`, or just orbit your view skyward) and the Meridian Ring fills your
vision, canted and immense, today engraved along its inner face. You two-finger swipe — and
the Ring spins. Days flicker past like a zoetrope: tablets whipping by, each dawn a faint
parchment flash, busy days streaking dense with glass, empty Saturdays passing as pure quiet
brass. You're scrubbing *time itself*, feeling the rhythm of your month as texture — that
brutal Tuesday reads as a cluster of light even at speed. You catch the Ring at next Friday:
it decelerates with a heavy, satisfying brass momentum, and Friday's tablets lean down toward
you, ready to be touched, rescheduled, or dragged onto a bough. Time in every other app is a
grid you look at. Here it is a wheel you put your hand on.

---

## 7. A DAY IN THE LIFE

**7:40** — Lid open. The Litany (Hero I). Jarvis reads the Ledger; you route last night's
firefly with your voice while pouring coffee. **8:10** — You press `T`; camera swings to
today's cluster on the School bough. You double-click into the Distributed Systems forge and
work the morning inside it; two embers ascend, two glass bells. The outside Tree stays dim
constellations. **11:50** — Overhead, faint through the forge glass, the lecture tablet is
sliding toward zenith. At T-15 the Ring tolls once from above; you Esc out, the forge folds
into its lantern behind you. **13:55** — During lecture, three thoughts hit; three `Cmd+K`
captures, three cork-pops, eyes never leaving the room. Two fireflies route themselves
instantly; one hovers cyan — Jarvis wasn't sure — and waits at the trunk without nagging.
**16:00** — Back at the dais, you flick the waiting firefly toward the Health bough; it lands,
becomes a gym task for tomorrow. You look up and zoetrope-scrub to Thursday to confirm the
week still breathes. **19:30** — You want a list, not a world: `Cmd+\` and the Studiolo folds
into the flat 2D app (§8) for twenty minutes of rapid triage — real inputs, real speed.
`Cmd+\` again; the chamber re-inflates exactly where you left it. **23:10** — You say
"goodnight, Jarvis." The Ledger writes the day's closing line — *five embers released, one
carried to tomorrow* — the boughs bank down to embers one by one, and the last thing lit is
the single candle-point on the dais. The room holds your life safe in the dark until morning.

---

## 8. DUAL-MODE — the World and the Page

The 2D app is not a fallback; it is **the Page to the World's Chamber** — the same studiolo,
written down. All real text editing, dense triage, forms, and accessibility-critical flows
live on the Page (per TECH.md's hard rule: text entry stays DOM-fast, and the 3D route is a
separate `ssr:false` island over the *same* TanStack Query hooks — two presentations, one
truth, zero parallel stores).

- **Toggle:** `Cmd+\` anywhere. World → Page: the camera pulls straight up the trunk, the
  Tree flattens into its familiar SVG tree (literally the preserved `AreasTree` component —
  the 2D tree *is* the canopy seen from above, a beautiful truth we get for free), and panels
  settle into the current dashboard layout, 300ms crossfade. Page → World: the tree lifts off
  the page and grows. The mapping is honest in both directions: **same colors, same
  hierarchy, same objects** — so switching modes never costs you your mental map.
- **The Page stays default** for cold loads, `prefers-reduced-motion`, weak GPUs, and any
  context where you're typing more than navigating. The World remembers your camera and
  pinned panels between visits.
- **Jarvis is identical in both** — same `Cmd+K`, same SSE ribbon; on the Page the routing
  thread renders as the existing toast/invalidations, in the World as the firefly flight.
  One agent, two theatres.

---

## 9. THE MVP SLICE — *"The Tree at Night"*

If we build exactly one thing to prove the magic, it is this vertical slice — the Vestibule,
alive with real data:

1. **The Tree, live.** `/world` route (ssr:false island). Trunk + boughs generated from real
   `getSidebarTree` output, area OKLCH hues as bough light. Project lanterns (instanced,
   cheap-hologram material), task embers (one `InstancedMesh` off the live tasks query) with
   the full state grammar: gold pulse today, ember-red overdue, and the **ascending spark +
   glass bell on completion** — reacting live to Supabase Realtime changes made from anywhere.
2. **Guided flight.** Click bough/lantern → `CameraControls` glide; Esc to pull back; `1–9`
   area keys; hover lean + caption. No WASD, no free-look.
3. **One panel.** A single uikit "Today" panel at the dais bound to live tasks (complete a
   task from inside the world and watch its spark ascend).
4. **Jarvis + the firefly flight.** `Cmd+K` → ring & ribbon → existing `/api/jarvis` SSE →
   when the routed action lands, the cyan thread/firefly flies to the correct bough and a new
   ember kindles. **This is the demo's climax and the product's thesis in one animation.**
5. **The boot-up.** A 6-second Litany (floor lines, boughs fading up, Ledger writing itself)
   — because the first ten seconds decide whether this feels like a game he wants to live in.
6. **The escape hatch.** `Cmd+\` back to the intact 2D app.

Explicitly **out** of the slice: the Meridian Ring, the forge/Project Mode, the Cartographer's
Table, sound beyond three chimes, WebGPU, free-walk. Ship the Tree at Night, stand on the
dais, say one sentence, and watch the light land where it belongs. If that doesn't make the
hair stand up, nothing after it will — and if it does, everything after it is just growing
more branches.

---

*— Fable, Creative Director. Dream filed. The candle is lit.*
