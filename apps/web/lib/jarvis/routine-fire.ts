import { and, desc, eq } from "drizzle-orm";
import type {
  Routine,
  RoutineBlock,
  RoutineSpec,
  RoutineTriggerType,
} from "@hyperpolymath/jarvis-core/routines";
import { sourceLabelForTool } from "@hyperpolymath/jarvis-core/routines";

import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisRoutineProgress,
  emitJarvisToolCall,
} from "@/lib/voice/physical-extension/bus";
import { db } from "@/lib/db";
import { routines } from "@/lib/db/schema";
import { resolveBlockId, runRoutine } from "@/lib/jarvis/routine-runner";

type RoutineRow = typeof routines.$inferSelect;

/** Row → API shape (shared by the GET sync route and the voice interception). */
export function toRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    spec: row.spec as RoutineSpec,
    triggerTypes: row.triggerTypes as RoutineTriggerType[],
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The owner's ENABLED routines, by user id (bearer-path safe; no cookies). */
export async function getEnabledRoutines(userId: string): Promise<Routine[]> {
  const rows = await db
    .select()
    .from(routines)
    .where(and(eq(routines.userId, userId), eq(routines.enabled, true)))
    .orderBy(desc(routines.updatedAt));
  return rows.map(toRoutine);
}

export interface FireRoutineOpts {
  userId: string;
  apiKey: string;
  isVoice: boolean;
  mode?: "computer";
  routineName: string;
  runId?: string;
  abortSignal?: AbortSignal;
  /**
   * Briefing cohesion (Option C). When true, blocks gather silently and ONE
   * synthesized butler brief is spoken under a single turnId. Off/omitted =
   * per-block narration (announce-before-act) as before.
   */
  synthesize?: boolean;
  /**
   * Parallel gather (synthesize-only). When true AND synthesize is true, gather
   * blocks run concurrently in a bounded pool. Ignored when synthesize is false.
   */
  parallel?: boolean;
}

/**
 * Fire a routine's blocks over the physical SSE bus (fire-and-forget). Each
 * block emits its own response-start → chunk/tool-call → response-end cycle
 * keyed by the block id, so the desktop renders/speaks a multi-block run with
 * zero protocol change. Returns the runId. Shared by /api/jarvis/routines/run
 * and the voice-transcript utterance interception.
 */
export function fireRoutineOverBus(blocks: RoutineBlock[], opts: FireRoutineOpts): string {
  const runId = opts.runId ?? crypto.randomUUID();

  // Real-time routine-progress lifecycle (synthesize mode only). The gather /
  // synthesis handlers below only fire in synth mode (runner-gated), but the
  // routine-level `start` emit lives here and needs its own gate; one local
  // flag keeps the "nothing emitted for a non-synthesize routine" contract
  // obvious. Compute the source skeleton once and close over it.
  const progress = opts.synthesize === true;
  const total = blocks.length;
  const sources = blocks.map((b, i) => ({
    blockId: resolveBlockId(b, runId, i),
    index: i,
    tool: b.tool as string,
    label: sourceLabelForTool(b.tool as string),
  }));
  if (progress) {
    // Emitted SYNCHRONOUSLY before runRoutine's first (awaited) work, so `start`
    // precedes the opener and every gather event.
    emitJarvisRoutineProgress({
      runId,
      routineName: opts.routineName,
      phase: "start",
      total,
      sources,
      at: Date.now(),
    });
  }

  void runRoutine(
    blocks,
    {
      userId: opts.userId,
      apiKey: opts.apiKey,
      source: { device: "routine", input: opts.isVoice ? "voice" : "text" },
      isVoice: opts.isVoice,
      mode: opts.mode,
      synthesize: opts.synthesize,
      parallel: opts.parallel,
      routineName: opts.routineName,
      runId,
      abortSignal: opts.abortSignal,
    },
    {
      onBlockStart: (blockId) => {
        emitJarvisResponseStart({ turnId: blockId, at: Date.now() });
      },
      onTextDelta: (blockId, delta) => {
        emitJarvisResponseChunk({ turnId: blockId, delta, at: Date.now() });
      },
      onAction: (blockId, toolUseId, name, result) => {
        emitJarvisToolCall({ turnId: blockId, toolUseId, name, result, at: Date.now() });
      },
      onBlockDone: (result) => {
        emitJarvisResponseEnd({ turnId: result.blockId, at: Date.now() });
      },
      onError: (blockId, message) => {
        emitJarvisResponseChunk({
          turnId: blockId,
          delta: `(routine block error: ${message})`,
          at: Date.now(),
        });
      },
      onRoutineDone: () => {
        // Completion observable from the last block's (or the synthesis)
        // response-end.
      },
      // --- Option C (synthesis) handlers -----------------------------------
      // The opener is its OWN one-shot turnId so it speaks the instant the
      // routine fires, while the blocks gather silently behind it.
      onOpener: (text) => {
        const openerId = `${runId}:opener`;
        emitJarvisResponseStart({ turnId: openerId, at: Date.now() });
        emitJarvisResponseChunk({ turnId: openerId, delta: text, at: Date.now() });
        emitJarvisResponseEnd({ turnId: openerId, at: Date.now() });
      },
      // The synthesized brief streams under ONE turnId — the desktop segments +
      // speaks it as a single cohesive utterance.
      onSynthesisStart: (turnId) => {
        // Progress FIRST so the HUD flips to "composing" before/with the brief's
        // first token.
        if (progress) {
          emitJarvisRoutineProgress({
            runId,
            routineName: opts.routineName,
            phase: "synthesizing",
            total,
            at: Date.now(),
          });
        }
        emitJarvisResponseStart({ turnId, at: Date.now() });
      },
      onSynthesisDelta: (turnId, delta) => {
        emitJarvisResponseChunk({ turnId, delta, at: Date.now() });
      },
      onSynthesisDone: (turnId) => {
        // Response end FIRST so `done` is truly terminal for the HUD.
        emitJarvisResponseEnd({ turnId, at: Date.now() });
        if (progress) {
          emitJarvisRoutineProgress({
            runId,
            routineName: opts.routineName,
            phase: "done",
            total,
            at: Date.now(),
          });
        }
      },
      // --- Gather progress (synthesize mode only; runner-gated) ------------
      onGatherBlockStart: (blockId, index, totalBlocks, tool) => {
        emitJarvisRoutineProgress({
          runId,
          routineName: opts.routineName,
          phase: "gather-start",
          total: totalBlocks,
          blockId,
          index,
          tool,
          label: sourceLabelForTool(tool),
          at: Date.now(),
        });
      },
      onGatherBlockDone: (result, index, totalBlocks) => {
        emitJarvisRoutineProgress({
          runId,
          routineName: opts.routineName,
          phase: "gather-done",
          total: totalBlocks,
          blockId: result.blockId,
          index,
          tool: result.tool,
          label: sourceLabelForTool(result.tool),
          ok: !result.error,
          ...(result.error ? { error: result.error } : {}),
          at: Date.now(),
        });
      },
    },
  ).catch((err: unknown) => {
    console.error("[routine-fire] routine execution failed", err);
  });
  return runId;
}
