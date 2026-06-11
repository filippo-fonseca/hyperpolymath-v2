import type { SessionEntity, JarvisToolName } from "@hyperpolymath/jarvis-core";

const MAX_ENTITIES = 10;

/**
 * Build the session-entities scratchpad text block.
 * Format: XML-tagged plain text consistent with Phase 11 snapshot style.
 * Per Pitfall 3 (RESEARCH.md): this block must NOT carry cache_control —
 * it changes every loop pass within a single user turn.
 */
export function buildSessionEntitiesBlock(entities: SessionEntity[]): string {
  if (entities.length === 0) return "";
  const recent = entities.slice(-MAX_ENTITIES);
  const lines = recent.map((e) => {
    const label = (e.title ?? e.content ?? "").slice(0, 60).replace(/"/g, "'");
    return `[${e.type.toUpperCase()}] id=${e.id} title="${label}" action=${e.action} at=${e.timestamp}`;
  });
  return [
    "SESSION ENTITIES (ids are real - use these directly for update_task/delete_task/update_capture/delete_capture/update_event/delete_event without calling find_* again):",
    ...lines,
  ].join("\n");
}

/**
 * Reconstruct session entities from the incoming history.
 * Walks assistant turns for tool_use blocks and the paired user turn for tool_result blocks.
 * Maps create, update, and delete tool names to SessionEntity records.
 * Used at start of runJarvisTurnStream to prime the scratchpad from prior turns.
 */
export function reconstructSessionEntitiesFromHistory(
  history: Array<{
    role: "user" | "assistant";
    content:
      | string
      | Array<{ type: string; [k: string]: unknown }>;
  }>,
): SessionEntity[] {
  const entities: SessionEntity[] = [];
  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    if (turn.role !== "assistant" || typeof turn.content === "string") continue;
    const blocks = turn.content;
    for (const block of blocks) {
      if (block.type !== "tool_use") continue;
      const name = block.name as JarvisToolName;
      const input = (block.input ?? {}) as Record<string, unknown>;
      // Find paired tool_result in the next user turn
      const next = history[i + 1];
      if (!next || next.role !== "user" || typeof next.content === "string") continue;
      const result = (
        next.content as Array<{
          type: string;
          tool_use_id?: string;
          content?: string;
        }>
      ).find(
        (b) => b.type === "tool_result" && b.tool_use_id === block.id,
      );
      if (!result || !result.content) continue;
      let parsed: {
        ok?: boolean;
        id?: string;
        receipt?: {
          id?: string;
          title?: string;
          content?: string;
          deleted?: boolean;
        };
      } = {};
      try {
        parsed = JSON.parse(result.content as string);
      } catch {
        continue;
      }
      if (parsed.ok === false) continue;

      // Map tool name → entity record
      const ts = new Date().toISOString(); // history timestamps aren't preserved; approximate
      if (name === "create_task" || name === "update_task") {
        entities.push({
          id: (parsed.id ?? (input.id as string)) as string,
          type: "task",
          title: parsed.receipt?.title ?? (input.title as string | undefined),
          action: name === "create_task" ? "created" : "updated",
          timestamp: ts,
        });
      } else if (name === "delete_task") {
        entities.push({
          id: input.id as string,
          type: "task",
          title: parsed.receipt?.title,
          action: "deleted",
          timestamp: ts,
        });
      } else if (name === "create_capture" || name === "update_capture") {
        entities.push({
          id: (parsed.id ?? (input.id as string)) as string,
          type: "capture",
          content: parsed.receipt?.content ?? (input.content as string | undefined),
          action: name === "create_capture" ? "created" : "updated",
          timestamp: ts,
        });
      } else if (name === "delete_capture") {
        entities.push({
          id: input.id as string,
          type: "capture",
          content: parsed.receipt?.content,
          action: "deleted",
          timestamp: ts,
        });
      } else if (name === "create_event" || name === "update_event") {
        entities.push({
          id: (parsed.id ?? (input.id as string)) as string,
          type: "event",
          title: parsed.receipt?.title ?? (input.title as string | undefined),
          action: name === "create_event" ? "created" : "updated",
          timestamp: ts,
        });
      } else if (name === "delete_event") {
        entities.push({
          id: input.id as string,
          type: "event",
          action: "deleted",
          timestamp: ts,
        });
      }
      // find_* tools do NOT add to session entities — find results are ephemeral context
    }
  }
  // Keep most recent MAX_ENTITIES
  return entities.slice(-MAX_ENTITIES);
}

/**
 * Map an executor tool_result into a SessionEntity to append during the loop.
 * Returns null for find_* and clarification/fact tools.
 */
export function entityFromToolResult(
  toolName: JarvisToolName,
  input: Record<string, unknown>,
  result: {
    ok: boolean;
    id?: string;
    receipt?: Record<string, unknown>;
  },
): SessionEntity | null {
  if (!result.ok) return null;
  const ts = new Date().toISOString();
  const receipt = result.receipt ?? {};
  switch (toolName) {
    case "create_task":
    case "update_task":
      return {
        id: (result.id ?? input.id) as string,
        type: "task",
        title: (receipt.title ?? input.title) as string | undefined,
        action: toolName === "create_task" ? "created" : "updated",
        timestamp: ts,
      };
    case "delete_task":
      return {
        id: input.id as string,
        type: "task",
        title: receipt.title as string | undefined,
        action: "deleted",
        timestamp: ts,
      };
    case "create_capture":
    case "update_capture":
      return {
        id: (result.id ?? input.id) as string,
        type: "capture",
        content: (receipt.content ?? input.content) as string | undefined,
        action: toolName === "create_capture" ? "created" : "updated",
        timestamp: ts,
      };
    case "delete_capture":
      return {
        id: input.id as string,
        type: "capture",
        content: receipt.content as string | undefined,
        action: "deleted",
        timestamp: ts,
      };
    case "create_event":
    case "update_event":
      return {
        id: (result.id ?? input.id) as string,
        type: "event",
        title: (receipt.title ?? input.title) as string | undefined,
        action: toolName === "create_event" ? "created" : "updated",
        timestamp: ts,
      };
    case "delete_event":
      return {
        id: input.id as string,
        type: "event",
        action: "deleted",
        timestamp: ts,
      };
    default:
      return null; // find_*, remember_fact, ask_clarification
  }
}
