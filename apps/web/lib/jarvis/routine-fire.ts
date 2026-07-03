import { and, desc, eq } from "drizzle-orm";
import type {
  Routine,
  RoutineBlock,
  RoutineSpec,
  RoutineTriggerType,
} from "@hyperpolymath/jarvis-core/routines";

import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
  emitJarvisToolCall,
} from "@/lib/voice/physical-extension/bus";
import { db } from "@/lib/db";
import { routines } from "@/lib/db/schema";
import { runRoutine } from "@/lib/jarvis/routine-runner";

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
  void runRoutine(
    blocks,
    {
      userId: opts.userId,
      apiKey: opts.apiKey,
      source: { device: "routine", input: opts.isVoice ? "voice" : "text" },
      isVoice: opts.isVoice,
      mode: opts.mode,
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
        // Completion observable from the last block's response-end (v1).
      },
    },
  ).catch((err: unknown) => {
    console.error("[routine-fire] routine execution failed", err);
  });
  return runId;
}
