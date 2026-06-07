# JARVIS Physical Extension

A hardware wake-word proxy for JARVIS. Replaces the browser's ambient
microphone listening with an external Arduino + voice-recognition module.

```
┌────────────────────┐  USB serial   ┌────────────────────┐   HTTP POST   ┌────────────────────┐    SSE     ┌────────────────────┐
│  Arduino + DF2301Q │ ────────────> │   Mac (bridge)     │ ────────────> │   Next.js server   │ ─────────> │   Browser tab      │
│  "Jarvis"          │ "ID=1 NAME=…" │  jarvis-serial-    │ /api/jarvis/  │  EventEmitter bus  │ trigger    │  mic acquire + 5-  │
│  wake fires        │               │  bridge.mjs        │ physical/...  │                    │            │  state FSM         │
└────────────────────┘               └────────────────────┘               └────────────────────┘            └────────────────────┘
```

The "Physical Extension Mode" toggle in Settings -> Voice (or wherever
you mount `<PhysicalExtensionToggle />`) is what activates this path.

## What it does

When Physical Extension Mode is **ON**:
- Browser does NOT spawn the on-device wake-word worker (no ambient mic, no 8.5+MB ONNX load)
- Browser opens an SSE connection to `/api/jarvis/physical/events`
- Arduino + DF2301Q listens on-device
- On wake-word fire, Arduino sends `ID=1 NAME=<wake word>` over USB serial
- Node bridge on Mac reads serial, POSTs to `/api/jarvis/physical/trigger` (with shared-secret auth)
- Server emits the trigger via in-memory EventEmitter; SSE pushes it to the browser
- Browser dispatches a `jarvis-wake-fire` CustomEvent on `window` -- the JarvisListener treats this identically to a browser-side wake-word fire and dispatches `WAKE_WORD_DETECTED` into the mic-state FSM
- Mic acquires, recording starts, normal JARVIS pipeline runs (STT -> agent -> TTS)

When Physical Extension Mode is **OFF**:
- Normal Phase 7/12 browser wake-word + PTT flow

Cmd+Shift+J PTT always works in both modes.

## Files

```
apps/web/lib/voice/physical-extension/
├── bus.ts                          server-side EventEmitter (globalThis stash)
├── types.ts                        PhysicalTrigger shape
├── use-physical-extension.ts       client SSE hook -> window CustomEvent
└── use-physical-extension-setting.ts   localStorage-backed enable toggle

apps/web/app/api/jarvis/physical/
├── trigger/route.ts                POST receiver (X-Trigger-Secret auth)
└── events/route.ts                 GET SSE stream

apps/web/components/voice/
├── PhysicalExtensionListener.tsx   null-renderer; mount in (app)/layout.tsx
└── PhysicalExtensionToggle.tsx     checkbox for Settings -> Voice

tools/jarvis-physical/
├── arduino/jarvis-mic-prototype.ino    Arduino sketch (already uploaded)
├── bridge/jarvis-serial-bridge.mjs     Node USB-serial -> HTTP bridge
├── bridge/package.json                 bridge deps (serialport, dotenv)
├── bridge/.env.example                 bridge config template
└── README.md                            this file
```

## Setup

### 1. Generate a shared secret

```bash
openssl rand -hex 32
```

Copy the output. You'll paste it into TWO places.

### 2. Server-side env

In `apps/web/.env.local`, add:

```
PHYSICAL_TRIGGER_SECRET=<paste-secret-here>
```

### 3. Bridge env

```bash
cd tools/jarvis-physical/bridge
cp .env.example .env
# Edit .env:
#   - SERIAL_PORT=/dev/cu.usbserial-XXXX  (find via: npm run list-ports)
#   - PHYSICAL_TRIGGER_SECRET=<paste-same-secret-here>
#   - TRIGGER_URL=http://localhost:3000/api/jarvis/physical/trigger
```

### 4. Install bridge dependencies

```bash
cd tools/jarvis-physical/bridge
npm install
```

### 5. Wire JarvisListener (ONE-LINE addition)

The PhysicalExtensionListener dispatches a `jarvis-wake-fire` window event when
the Arduino fires. JarvisListener needs to listen for it and dispatch
`WAKE_WORD_DETECTED` into the FSM. Add inside `JarvisListener.tsx`:

```ts
useEffect(() => {
  const handler = () => dispatch({ type: "WAKE_WORD_DETECTED" });
  window.addEventListener("jarvis-wake-fire", handler);
  return () => window.removeEventListener("jarvis-wake-fire", handler);
}, []);
```

(If you're on `feature/jarvis-physical-extension` and haven't merged Phase 12
yet, this stays surgical. Phase 12's planned rewire of JarvisListener should
preserve this hook or formalize it into the new architecture.)

### 6. Mount the listener

In `apps/web/app/(app)/layout.tsx` (alongside `<JarvisWarmer />` from Phase 11):

```tsx
import { PhysicalExtensionListener } from "@/components/voice/PhysicalExtensionListener";

// ...inside the layout JSX:
<PhysicalExtensionListener />
```

### 7. Add the toggle to Settings

Mount `<PhysicalExtensionToggle />` somewhere in your Settings -> Voice
section. Style as needed.

## Running it

Three terminals:

```bash
# Terminal 1 — Next.js dev server
cd apps/web
pnpm dev

# Terminal 2 — Bridge (close the Arduino IDE Serial Monitor first;
# the port can only be open in one program)
cd tools/jarvis-physical/bridge
pnpm start

# Terminal 3 — open http://localhost:3000 in your browser, sign in,
# grant mic permission (one-time click via EnableVoiceModal),
# toggle "Physical Extension Mode" in Settings.
```

Then say **"Jarvis"** to the Arduino module. Sequence you should see:

1. Module chimes (it's awake)
2. Bridge logs: `[bridge] FIRE id=1 (<wake word>) -> 200`
3. Server logs: nothing by default, but you'll see the route hit
4. Browser: mic indicator dot transitions `listening -> recording`,
   you have the wake-time window (default 20s) to talk

## Verifying which ID fires when you say "Jarvis"

Module behavior varies — some firmware sends `ID=1` on the learned wake word,
others only send IDs for post-wake commands. To check:

1. Start the bridge with `TRIGGER_IDS=*` (fire on any recognized phrase)
2. Watch the bridge console while saying "Jarvis" and a command
3. Note which ID appears for the wake-word fire vs. for a command
4. Set `TRIGGER_IDS` to whichever you want as the trigger

If the wake-word itself doesn't print, configure `TRIGGER_IDS=*` and treat
ANY recognized phrase as a wake event — the on-device recognition is the
gate either way.

## Source: DF2301Q module

- Product page: <https://wiki.dfrobot.com/sen0539-en>
- 121 fixed commands + 17 custom slots
- Learn custom wake word: wake module -> "Learning wake word" -> say new word 3x
- I2C mode: switch on module MUST be set to I2C (not UART)
- I2C wiring: VCC->5V, GND->GND, C/R->A5 (SCL), D/T->A4 (SDA)

## Architecture notes

**Why SSE not WebSocket?** One-way server-to-browser push is all we need. SSE
is simpler, auto-reconnects, no upgrade handshake.

**Why in-memory EventEmitter?** Single-user MVP on one server process. If we
ever go multi-instance (Vercel serverless without sticky), this needs a Redis
pub-sub or Postgres LISTEN/NOTIFY backbone. Documented as a future swap.

**Why shared secret over no auth?** Even on localhost, any local process can
hit `localhost:3000`. The secret prevents random network actors (browser
extensions, malware, other local tools) from triggering your mic. Treat the
secret like an API key — don't commit it.

**Why "Physical Extension Mode" as an orthogonal toggle (not a 4th listening
mode)?** Composes correctly with Discreet mode: you can have a hardware wake
button AND silent TTS reply. The 3-mode picker (wake-word / push-to-talk /
discreet) controls TTS and PTT semantics; Physical Extension Mode swaps the
SOURCE of the wake signal.

**Why not migrate to ESP32 now?** The Arduino + USB bridge is fine for
prototype. Long-term, ESP32 with WiFi removes the Mac middleman — same SSE
endpoint, just hit it from the ESP32 directly with the shared secret in a
header. Bridge code becomes Arduino code.
