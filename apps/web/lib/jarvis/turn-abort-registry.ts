// apps/web/lib/jarvis/turn-abort-registry.ts
//
// Real server-side abort for the persistent-SSE voice path.
//
// The browser SSE route (/api/jarvis) aborts naturally: the client fetch abort
// closes the ReadableStream and `req.signal` cancels the upstream Anthropic
// stream. The voice/transcript route has no such handle — it runs the turn
// fire-and-forget via `after()`, so a stop/barge-in only silenced client-side
// audio while the server kept streaming chunks over the physical bus.
//
// This registry closes that gap. Each voice turn registers an AbortController
// keyed by turnId; the /api/jarvis/voice/cancel endpoint emits a `jarvis-cancel`
// bus event, and the module listener below aborts the matching controller —
// which propagates into runJarvisTurnStream (Anthropic stream aborted, remaining
// tool rounds skipped). In-flight tool executions are allowed to settle; only
// follow-up rounds and further chunk emits stop.
//
// Cross-instance: on Vercel the turn and the cancel POST can land on different
// lambda instances. The turn's instance is already subscribed to the Supabase
// Realtime broadcast (it emits response chunks through the same bus), so the
// `jarvis-cancel` broadcast reaches it and re-emits on the local physicalBus,
// where this listener aborts the local controller.

import { physicalBus } from "@/lib/voice/physical-extension/bus";
import type { PhysicalJarvisCancel } from "@/lib/voice/physical-extension/types";

// Survive Next dev hot-reload / module re-eval by pinning the map + the
// listener-installed flag on globalThis (same pattern as the bus EventEmitter).
const g = globalThis as unknown as {
  __jarvisTurnAborts?: Map<string, AbortController>;
  __jarvisTurnAbortListener?: boolean;
};

const controllers: Map<string, AbortController> =
  g.__jarvisTurnAborts ?? (g.__jarvisTurnAborts = new Map());

/** Register (or replace) the abort controller for an in-flight voice turn. */
export function registerTurnAbort(turnId: string): AbortController {
  const existing = controllers.get(turnId);
  if (existing) return existing;
  const controller = new AbortController();
  controllers.set(turnId, controller);
  return controller;
}

/** Retire a turn's controller once the run settles (done / error / abort). */
export function unregisterTurnAbort(turnId: string): void {
  controllers.delete(turnId);
}

/** Abort one turn on THIS instance if it's registered here. Returns true if hit. */
export function abortTurn(turnId: string): boolean {
  const controller = controllers.get(turnId);
  if (!controller) return false;
  controller.abort();
  controllers.delete(turnId);
  return true;
}

/** Abort every in-flight turn on THIS instance. Returns the count aborted. */
export function abortAllTurns(): number {
  let n = 0;
  for (const [id, controller] of controllers) {
    controller.abort();
    controllers.delete(id);
    n++;
  }
  return n;
}

// Install the cross-instance listener exactly once per process. A cancel emitted
// on any instance reaches the turn's instance via the Realtime bridge and lands
// here as a local physicalBus event.
if (!g.__jarvisTurnAbortListener) {
  g.__jarvisTurnAbortListener = true;
  physicalBus.on("jarvis-cancel", (payload: PhysicalJarvisCancel) => {
    if (payload?.all) {
      abortAllTurns();
    } else if (payload?.turnId) {
      abortTurn(payload.turnId);
    }
  });
}
