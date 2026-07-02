// apps/desktop/src/actions/computer-use.ts
// Desktop side of the Computer Use fallback loop — the companion to
// apps/web/app/api/jarvis/computer-use/step/route.ts.
//
// The DESKTOP drives the agentic loop: capture screen → downscale → POST to
// /api/jarvis/computer-use/step → execute the returned computer_20251124
// actions with the Rust primitives (mouse_click / mouse_move / type_text /
// press_key) → repeat with the execution results until the server says done
// (or the shared 15-step cap trips server-side). The server owns ALL speech —
// it narrates progress/completion/failure over the physical SSE bus — so this
// module never speaks; it only acts and logs with the [computer-use] prefix.
//
// FOCUS RULE (RESEARCH Q4): never set_focus() the HUD window from this loop.
// The HUD is alwaysOnTop + Accessory; the app being driven must keep key focus.

import { invoke } from "@tauri-apps/api/core";
import { currentMonitor } from "@tauri-apps/api/window";

import { bytesToBase64, cropAndDownscalePng, downscalePngWithInfo } from "@/actions/png";
import { postComputerUseStep, type ComputerUseToolResult } from "@/api/client";

/** Fixed contract with the backend executor (apps/web/lib/jarvis/executor.ts). */
export interface ComputerUseAction {
  kind: "computer_use";
  task: string;
  session_id: string;
}

/** Mirrors MAX_STEPS in the step route. The loop deliberately posts step
 *  index MAX_STEPS once more so the SERVER trips its cap and speaks the
 *  failure line; that response comes back done:true and the loop ends. */
const MAX_STEPS = 15;

/** Long edge of screenshots shipped to the model (downscaled in-webview). */
const LONG_EDGE_PX = 1440;

/** Settle time after a mouse/keyboard action before anything else happens,
 *  so the UI has repainted by the time the next screenshot is captured. */
const SETTLE_MS = 350;

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

/** Dimensions of the current full-frame capture and its downscaled copy. */
interface FrameDims {
  /** screencapture output — RETINA pixels. */
  srcW: number;
  srcH: number;
  /** downscaled image the model sees (declared as display_width/height). */
  downW: number;
  downH: number;
}

/** Screen size in POINTS (what enigo's mouse addresses). */
interface ScreenPoints {
  width: number;
  height: number;
}

// COORDINATE MAPPING — the load-bearing math:
//   1. The model sees the DOWNSCALED screenshot and emits coordinates in its
//      pixel space (downW × downH — exactly what we declare to the API as
//      display_width/display_height).
//   2. `screencapture` captured the frame in RETINA PIXELS (srcW × srcH,
//      typically 2× the screen's point size).
//   3. enigo (mouse_click / mouse_move) addresses the screen in POINTS
//      (monitor physical px ÷ scaleFactor, e.g. 1512×982 on a 14" MBP).
// So:  point = model_coord × (srcPx / downPx)      — undo the downscale
//                          ÷ (srcPx / screenPoints) — undo the retina backing
// which collapses to model_coord × screenPoints / downPx. The backing scale
// factor is DERIVED as srcPx/screenPoints (per axis) rather than read off the
// monitor, so the math stays correct even if screencapture's pixel size ever
// disagrees with monitor.size.
function toScreenPoint(
  modelX: number,
  modelY: number,
  dims: FrameDims,
  screen: ScreenPoints,
): { x: number; y: number } {
  const captureScaleX = dims.srcW / dims.downW;
  const captureScaleY = dims.srcH / dims.downH;
  const backingX = dims.srcW / screen.width;
  const backingY = dims.srcH / screen.height;
  return {
    x: Math.round((modelX * captureScaleX) / backingX),
    y: Math.round((modelY * captureScaleY) / backingY),
  };
}

/** Screen size in points: monitor physical px ÷ scaleFactor, with
 *  window.screen (already points in the webview) as the fallback. */
async function getScreenPoints(): Promise<ScreenPoints> {
  try {
    const monitor = await currentMonitor();
    if (monitor && monitor.size.width > 0 && monitor.scaleFactor > 0) {
      return {
        width: monitor.size.width / monitor.scaleFactor,
        height: monitor.size.height / monitor.scaleFactor,
      };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[computer-use] currentMonitor failed — falling back to window.screen", err);
  }
  return { width: window.screen.width, height: window.screen.height };
}

// ---------------------------------------------------------------------------
// Model-action execution
// ---------------------------------------------------------------------------

/** Zoom region requested by the model, in DOWNSCALED full-frame space. */
interface ZoomRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ExecOutcome {
  ok: boolean;
  error?: string;
  /** Set when the model asked for a zoomed look at a region. */
  zoom?: ZoomRegion;
  /** True when the action touched mouse/keyboard (needs SETTLE_MS after). */
  touchedInput: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCoordinate(v: unknown): { x: number; y: number } | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const [x, y] = v;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x, y };
}

function parseRegion(v: unknown): ZoomRegion | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const [x0, y0, x1, y1] = v;
  if (
    typeof x0 !== "number" ||
    typeof y0 !== "number" ||
    typeof x1 !== "number" ||
    typeof y1 !== "number"
  ) {
    return null;
  }
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

/** Modifier aliases → the lowercase names Rust parse_modifier accepts. */
const MODIFIER_ALIASES: Record<string, string> = {
  cmd: "cmd",
  command: "cmd",
  meta: "cmd",
  super: "cmd",
  win: "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
};

/** Key-name aliases (xdotool style → Rust parse_key names) that lowercasing
 *  + underscore-stripping alone doesn't cover. */
const KEY_ALIASES: Record<string, string> = {
  prior: "pageup",
  next: "pagedown",
  kpenter: "enter",
};

/** "cmd+shift+t" / "Return" / "Page_Down" → press_key(key, modifiers). */
function parseKeyCombo(combo: string): { key: string; modifiers: string[] } {
  const parts = combo
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const rawKey = parts.pop() ?? combo;
  const modifiers = parts.map((m) => MODIFIER_ALIASES[m.toLowerCase()] ?? m.toLowerCase());
  // Single characters go straight through (Rust maps them via Key::Unicode).
  if (rawKey.length === 1) return { key: rawKey.toLowerCase(), modifiers };
  const lower = rawKey.toLowerCase().replace(/_/g, ""); // Page_Down → pagedown
  return { key: KEY_ALIASES[lower] ?? lower, modifiers };
}

/** Click actions → Rust mouse_click button + press count. Double/triple are
 *  emitted as back-to-back clicks (no dedicated Rust primitive); they land
 *  within the macOS double-click interval since enigo clicks are fast. */
const CLICK_ACTIONS: Record<string, { button: string; presses: number }> = {
  left_click: { button: "left", presses: 1 },
  right_click: { button: "right", presses: 1 },
  middle_click: { button: "middle", presses: 1 },
  double_click: { button: "left", presses: 2 },
  triple_click: { button: "left", presses: 3 },
};

/**
 * Execute ONE computer_20251124 tool_use input with the Rust primitives.
 * Throws are handled by the caller (converted into is_error tool_results so
 * the model can adapt). Unsupported action kinds (scroll / drag / hold_key /
 * mouse_down…) are forbidden by the server's system prompt AND unsupported by
 * the Rust layer — they come back ok:false so the model switches to a
 * keyboard equivalent.
 */
async function executeModelAction(
  input: Record<string, unknown>,
  dims: FrameDims,
  screen: ScreenPoints,
): Promise<ExecOutcome> {
  const kind = typeof input["action"] === "string" ? (input["action"] as string) : "";

  if (kind === "screenshot") {
    // No-op: the loop re-captures a fresh frame for every step anyway.
    // eslint-disable-next-line no-console
    console.log("[computer-use] action screenshot — fresh capture ships next step");
    return { ok: true, touchedInput: false };
  }

  if (kind === "zoom") {
    const region = parseRegion(input["region"]);
    if (!region) {
      return { ok: false, error: "zoom requires region [x0,y0,x1,y1]", touchedInput: false };
    }
    // eslint-disable-next-line no-console
    console.log(
      `[computer-use] action zoom region=(${region.x0},${region.y0})→(${region.x1},${region.y1})`,
    );
    return { ok: true, zoom: region, touchedInput: false };
  }

  const click = CLICK_ACTIONS[kind];
  if (click) {
    const coord = parseCoordinate(input["coordinate"]);
    if (!coord) {
      return { ok: false, error: `${kind} requires coordinate [x,y]`, touchedInput: false };
    }
    const point = toScreenPoint(coord.x, coord.y, dims, screen);
    // eslint-disable-next-line no-console
    console.log(
      `[computer-use] action ${kind} model=(${coord.x},${coord.y}) → point=(${point.x},${point.y})`,
    );
    for (let i = 0; i < click.presses; i++) {
      await invoke("mouse_click", { x: point.x, y: point.y, button: click.button });
    }
    return { ok: true, touchedInput: true };
  }

  if (kind === "mouse_move") {
    const coord = parseCoordinate(input["coordinate"]);
    if (!coord) {
      return { ok: false, error: "mouse_move requires coordinate [x,y]", touchedInput: false };
    }
    const point = toScreenPoint(coord.x, coord.y, dims, screen);
    // eslint-disable-next-line no-console
    console.log(
      `[computer-use] action mouse_move model=(${coord.x},${coord.y}) → point=(${point.x},${point.y})`,
    );
    await invoke("mouse_move", { x: point.x, y: point.y });
    return { ok: true, touchedInput: true };
  }

  if (kind === "type") {
    const text = typeof input["text"] === "string" ? (input["text"] as string) : "";
    if (!text) return { ok: false, error: "type requires text", touchedInput: false };
    // eslint-disable-next-line no-console
    console.log(`[computer-use] action type (${text.length} chars)`);
    await invoke("type_text", { text });
    return { ok: true, touchedInput: true };
  }

  if (kind === "key") {
    const combo = typeof input["text"] === "string" ? (input["text"] as string).trim() : "";
    if (!combo) return { ok: false, error: "key requires text", touchedInput: false };
    const { key, modifiers } = parseKeyCombo(combo);
    // eslint-disable-next-line no-console
    console.log(
      `[computer-use] action key "${combo}" → press_key(${key}${modifiers.length ? `, [${modifiers.join("+")}]` : ""})`,
    );
    await invoke("press_key", { key, modifiers });
    return { ok: true, touchedInput: true };
  }

  if (kind === "wait") {
    const duration = typeof input["duration"] === "number" ? (input["duration"] as number) : 1;
    const ms = Math.round(Math.min(Math.max(duration, 0), 5) * 1000);
    // eslint-disable-next-line no-console
    console.log(`[computer-use] action wait ${ms}ms`);
    await sleep(ms);
    return { ok: true, touchedInput: false };
  }

  return { ok: false, error: `unsupported action: ${kind || "(missing)"}`, touchedInput: false };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

let running = false;

/**
 * Entry point (dispatcher, action.kind === "computer_use"). Never throws and
 * never speaks — the server narrates over SSE; errors are logged and stop the
 * loop. One loop at a time: a computer_use arriving mid-session is dropped.
 */
export async function runComputerUseLoop(action: ComputerUseAction): Promise<void> {
  if (running) {
    // eslint-disable-next-line no-console
    console.warn(
      `[computer-use] session ${action.session_id} dropped — another loop is already running`,
    );
    return;
  }
  running = true;
  // eslint-disable-next-line no-console
  console.log(`[computer-use] session ${action.session_id} start: "${action.task}"`);
  try {
    await driveLoop(action);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[computer-use] session ${action.session_id} aborted`, err);
  } finally {
    running = false;
  }
}

async function driveLoop(action: ComputerUseAction): Promise<void> {
  const screen = await getScreenPoints();
  let history: unknown[] = [];
  let toolResults: ComputerUseToolResult[] = [];
  /** Zoom requested by the previous step (downscaled full-frame space). */
  let pendingZoom: ZoomRegion | null = null;
  /** Dims of the latest FULL-frame capture — the model's coordinate space. */
  let frame: FrameDims | null = null;

  // <= MAX_STEPS: the final iteration posts step_index === MAX_STEPS, which
  // the server short-circuits into its spoken cap-failure line + done:true.
  for (let stepIndex = 0; stepIndex <= MAX_STEPS; stepIndex++) {
    // 1. Capture the full screen (retina pixels via `screencapture -x`).
    const raw = new Uint8Array(await invoke<number[]>("take_screenshot", { region: null }));

    // 2. Downscale — or, for a pending zoom, crop the requested region out of
    //    the full capture first. The tool's DECLARED display space stays the
    //    full frame either way: the zoom image is inline content for
    //    inspection, and the model keeps emitting full-frame coordinates.
    let screenshotBase64: string;
    let displayWidth: number;
    let displayHeight: number;
    if (pendingZoom && frame) {
      const sx = frame.srcW / frame.downW;
      const sy = frame.srcH / frame.downH;
      const crop = await cropAndDownscalePng(
        raw,
        {
          x: pendingZoom.x0 * sx,
          y: pendingZoom.y0 * sy,
          width: (pendingZoom.x1 - pendingZoom.x0) * sx,
          height: (pendingZoom.y1 - pendingZoom.y0) * sy,
        },
        LONG_EDGE_PX,
      );
      screenshotBase64 = bytesToBase64(crop.bytes);
      displayWidth = frame.downW;
      displayHeight = frame.downH;
      // eslint-disable-next-line no-console
      console.log(
        `[computer-use] step ${stepIndex}: zoom crop ${crop.width}×${crop.height} (${crop.bytes.length} bytes)`,
      );
    } else {
      const down = await downscalePngWithInfo(raw, LONG_EDGE_PX);
      frame = { srcW: down.srcWidth, srcH: down.srcHeight, downW: down.width, downH: down.height };
      screenshotBase64 = bytesToBase64(down.bytes);
      displayWidth = down.width;
      displayHeight = down.height;
      // eslint-disable-next-line no-console
      console.log(
        `[computer-use] step ${stepIndex}: captured ${frame.srcW}×${frame.srcH} → ${frame.downW}×${frame.downH} (${down.bytes.length} bytes)`,
      );
    }
    pendingZoom = null;

    // 3. Ship the step; get the model's next actions.
    const res = await postComputerUseStep({
      sessionId: action.session_id,
      task: action.task,
      stepIndex,
      screenshotBase64,
      displayWidth,
      displayHeight,
      history,
      toolResults,
    });
    if (!res) {
      // Transport/server failure — stop silently (server owns speech).
      // eslint-disable-next-line no-console
      console.warn(`[computer-use] session ${action.session_id} stopped at step ${stepIndex} — server error`);
      return;
    }
    if (res.done) {
      // eslint-disable-next-line no-console
      console.log(
        `[computer-use] session ${action.session_id} done at step ${stepIndex}${res.say ? ` — "${res.say}"` : ""}`,
      );
      return;
    }

    // 4. Execute the returned actions; answer every tool_use id next step.
    history = res.history;
    toolResults = [];
    for (const next of res.actions) {
      let outcome: ExecOutcome;
      try {
        outcome = await executeModelAction(next.input, frame, screen);
      } catch (err) {
        outcome = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          touchedInput: false,
        };
      }
      if (!outcome.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[computer-use] step ${stepIndex}: action failed — ${outcome.error}`);
      }
      if (outcome.zoom) pendingZoom = outcome.zoom;
      toolResults.push({
        tool_use_id: next.id,
        ok: outcome.ok,
        ...(outcome.error ? { error: outcome.error } : {}),
      });
      // Let the UI settle after real input before the next action/capture.
      if (outcome.touchedInput) await sleep(SETTLE_MS);
    }
  }

  // Unreachable in practice: the server's cap response at index MAX_STEPS
  // returns done:true above. Belt-and-braces log if it ever isn't.
  // eslint-disable-next-line no-console
  console.warn(`[computer-use] session ${action.session_id} exceeded the local step bound`);
}
