// Zod runtime validator for the routine spec — the web server actions validate
// against `zRoutineSpec` before persisting, and the desktop validates when
// reading a spec back. This is a critical-path contract (block-engine +
// desktop-triggers depend on the parsed shape).
//
// NOTE: `zRoutineBlock.tool` is a plain `string`, NOT a Zod enum of
// `JarvisToolName`, on purpose. routine-model does NOT validate tool params —
// each tool's own Zod in `../tools/*` does, at execution time, inside the
// block-engine. Keeping `tool`/`params` open here avoids a validation
// choke-point that would need editing every time a tool is added.

import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import { ROUTINE_SPEC_VERSION } from "./types";
import type { RoutineSpec, RoutineTriggerType } from "./types";

// --- Trigger schemas (discriminated union over `type`) --------------------

const zWakeTrigger = z.object({
  type: z.literal("wake"),
  phrase: z.string().min(1).max(120),
});

const zUtteranceTrigger = z.object({
  type: z.literal("utterance"),
  match: z.string().min(1).max(200),
});

const zTimeTrigger = z.object({
  type: z.literal("time"),
  at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM (24h)"),
  tz: z.string().min(1).max(64).optional(),
});

const zHotkeyTrigger = z.object({
  type: z.literal("hotkey"),
  accelerator: z.string().min(1).max(64),
});

export const zRoutineTrigger = z.discriminatedUnion("type", [
  zWakeTrigger,
  zUtteranceTrigger,
  zTimeTrigger,
  zHotkeyTrigger,
]);

// --- Block schema ---------------------------------------------------------

export const zRoutineBlock = z.object({
  id: z.string().min(1),
  // JarvisToolName — kept as an open string so the block-engine owns per-tool
  // param validation. Do NOT tighten to an enum here.
  tool: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
  nlDirective: z.string().max(2000).optional(),
  // Free-text INSTRUCTIONS for the spoken "loading" filler line played while
  // this block gathers. Interpreted by the runner (small prose-only Anthropic
  // call), not spoken verbatim. Optional — existing specs parse unchanged.
  loadingInstruction: z.string().max(2000).optional(),
});

// --- Spec schema ----------------------------------------------------------

export const zRoutineSpec = z.object({
  version: z.literal(ROUTINE_SPEC_VERSION),
  triggers: z.array(zRoutineTrigger).min(1), // a routine needs ≥1 trigger
  blocks: z.array(zRoutineBlock).min(1), //     …and ≥1 block
  // Briefing cohesion (Option C): gather blocks silently, then speak ONE
  // synthesized butler brief. Optional + off by default — existing specs
  // parse unchanged.
  synthesize: z.boolean().optional(),
  // Parallel gather (synthesize-only): run gather blocks concurrently in a
  // bounded pool. Optional + off by default — existing specs parse unchanged;
  // only honored when synthesize is true.
  parallel: z.boolean().optional(),
});

/** Loose input type (pre-defaults) accepted by `zRoutineSpec.parse`. */
export type RoutineSpecInput = z.input<typeof zRoutineSpec>;

// --- Derived denormalizations (written to first-class DB columns) ---------

/**
 * Dedupe of the trigger `type` strings present in a spec, e.g. `["time","wake"]`.
 * Persisted to the `trigger_types text[]` column so the scheduler can do
 * `WHERE 'time' = ANY(trigger_types)` on a GIN index without JSONB extraction.
 * The spec remains the source of truth; this is a derived cache.
 */
export function deriveTriggerTypes(spec: RoutineSpec): RoutineTriggerType[] {
  return [...new Set(spec.triggers.map((t) => t.type))];
}

/**
 * Compute the earliest upcoming UTC instant across all `time` triggers in a
 * spec, or `null` when there is no time trigger. Pure + clock-injectable so the
 * future scheduler unit can reuse it. For each time trigger the "HH:MM" is
 * resolved in its tz (falling back to `fallbackTz`) to the next future instant
 * — today if still ahead of `now`, otherwise tomorrow (v1 = daily cadence).
 *
 * @param spec       validated routine spec
 * @param fallbackTz IANA tz used when a time trigger omits `tz`
 * @param now        reference instant (defaults to `new Date()`)
 * @returns ISO 8601 UTC string, or null
 */
export function computeNextRunAt(
  spec: RoutineSpec,
  fallbackTz: string,
  now: Date = new Date(),
): string | null {
  let earliest: number | null = null;

  for (const trigger of spec.triggers) {
    if (trigger.type !== "time") continue;

    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trigger.at);
    if (!match) continue; // defensive — spec is Zod-validated upstream
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const tz = trigger.tz ?? fallbackTz;

    // Interpret "now" in the trigger's tz to read today's wall-clock date.
    const zonedNow = new TZDate(now.getTime(), tz);
    let candidate = new TZDate(
      zonedNow.getFullYear(),
      zonedNow.getMonth(),
      zonedNow.getDate(),
      hour,
      minute,
      0,
      0,
      tz,
    );
    // If today's fire time already passed, roll to tomorrow (daily v1).
    if (candidate.getTime() <= now.getTime()) {
      candidate = new TZDate(candidate.getTime() + 24 * 60 * 60 * 1000, tz);
    }

    const ms = candidate.getTime();
    if (earliest === null || ms < earliest) earliest = ms;
  }

  return earliest === null ? null : new Date(earliest).toISOString();
}
