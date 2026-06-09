/**
 * get_snapshot_history MCP tool (MCP-04, v1).
 *
 * Returns METADATA ONLY for the last N (1..30) days of snapshots. The
 * `nodes` and `edges` arrays are intentionally excluded — a 30-day window
 * of full payloads can be 10s of MB, well over the MCP tool response budget.
 * To fetch the latest full payload, call get_current_context instead.
 *
 * The `days` Zod schema caps at 30 — both because the v1 use case is "show
 * me the last month" and because larger windows would defeat the
 * metadata-only privacy posture (history grows unboundedly otherwise).
 *
 * Split into make…Handler + register…() per the same testability pattern
 * as get-current-context.ts.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LoadHistory } from "../data/load-snapshot.js";
import type { SnapshotHistoryEntry } from "../types.js";

/** The ZodRawShape for server.tool() — keys are individual Zod schemas. */
export const getSnapshotHistoryParamsShape = {
  days: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(7)
    .describe("Number of days of history (1..30)."),
} as const;

/** Inferred argument type — what the handler receives AFTER Zod parsing. */
type GetSnapshotHistoryArgs = {
  days: number;
};

/** Standard MCP tool response shape. */
type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
};

export type GetSnapshotHistoryCtx = {
  userId: string;
  loadHistory: LoadHistory;
};

/**
 * Pure handler factory — returns the async function that processes a tool
 * call. Exported so tests can drive the handler directly with a stub
 * loadHistory, without instantiating a real McpServer or transport.
 */
export function makeGetSnapshotHistoryHandler(
  ctx: GetSnapshotHistoryCtx,
): (args: GetSnapshotHistoryArgs) => Promise<ToolResponse> {
  return async ({ days }) => {
    const history: SnapshotHistoryEntry[] = await ctx.loadHistory(ctx.userId, days);
    return { content: [{ type: "text", text: JSON.stringify(history, null, 2) }] };
  };
}

/** Thin registration wrapper — binds the handler to an McpServer instance. */
export function registerGetSnapshotHistory(
  server: McpServer,
  ctx: GetSnapshotHistoryCtx,
): void {
  const handler = makeGetSnapshotHistoryHandler(ctx);
  server.tool(
    "get_snapshot_history",
    "Returns metadata (date + per-type node counts) for recent snapshots. " +
      "Does NOT include the full payload (those can be large) — call " +
      "get_current_context for the latest payload.",
    getSnapshotHistoryParamsShape,
    async (args) => handler(args as GetSnapshotHistoryArgs),
  );
}
