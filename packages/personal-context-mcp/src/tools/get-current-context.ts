/**
 * get_current_context MCP tool (MCP-04, v1).
 *
 * Returns the most recent personal-context snapshot for the connected user.
 * Optionally trim the returned nodes to a subset of node types via the
 * `topics` parameter — useful when an agent only needs e.g. tasks + projects
 * for a planning conversation.
 *
 * Split into two pieces per the plan's testability note:
 *   1. makeGetCurrentContextHandler(ctx) — returns the bare async handler so
 *      tests can call it directly without spinning up an MCP transport.
 *   2. registerGetCurrentContext(server, ctx) — the thin wrapper that
 *      registers the handler on the McpServer with its Zod paramsSchema.
 *
 * Tool naming: snake_case + verb_noun (RESEARCH.md prior-art survey of the
 * first 100 MCP servers showed >90% use this pattern).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LoadSnapshot } from "../data/load-snapshot.js";
import type { ContextSnapshot, NodeType } from "../types.js";

/** Enum mirroring the seven node types in NodeSchema. Must stay in sync. */
const TopicEnum = z.enum([
  "area",
  "project",
  "task",
  "capture",
  "training_activity",
  "habit",
  "jarvis_fact",
]);

/** The ZodRawShape for server.tool() — keys are individual Zod schemas. */
export const getCurrentContextParamsShape = {
  topics: z
    .array(TopicEnum)
    .optional()
    .describe("If provided, return only nodes of these types."),
} as const;

/** Inferred argument type — what the handler receives. */
type GetCurrentContextArgs = {
  topics?: NodeType[];
};

/** Standard MCP tool response shape. */
type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
};

export type GetCurrentContextCtx = {
  userId: string;
  loadSnapshot: LoadSnapshot;
};

/**
 * Pure handler factory — returns the async function that processes a tool
 * call. Exported so tests can drive the handler directly with a stub
 * loadSnapshot, without instantiating a real McpServer or transport.
 */
export function makeGetCurrentContextHandler(
  ctx: GetCurrentContextCtx,
): (args: GetCurrentContextArgs) => Promise<ToolResponse> {
  return async ({ topics }) => {
    const snap = await ctx.loadSnapshot(ctx.userId);
    if (!snap) {
      return { content: [{ type: "text", text: "No snapshot available yet." }] };
    }
    const filtered: ContextSnapshot = topics?.length
      ? { ...snap, nodes: snap.nodes.filter((n) => topics.includes(n.type)) }
      : snap;
    return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
  };
}

/** Thin registration wrapper — binds the handler to an McpServer instance. */
export function registerGetCurrentContext(server: McpServer, ctx: GetCurrentContextCtx): void {
  const handler = makeGetCurrentContextHandler(ctx);
  server.tool(
    "get_current_context",
    "Returns the most recent personal context snapshot for the connected user. " +
      "Optionally filter to specific node types (topics). Use this at the start " +
      "of any conversation to load what the agent already knows about the user.",
    getCurrentContextParamsShape,
    async (args) => handler(args as GetCurrentContextArgs),
  );
}
