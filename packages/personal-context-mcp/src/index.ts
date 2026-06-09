/**
 * @hyperpolymath/personal-context-mcp — public barrel.
 *
 * Phase 999.12 Plan 03 (MCP-01). Exposes a single factory —
 * createPersonalContextServer({ userId, loadSnapshot, loadHistory }) —
 * that returns a fully-configured McpServer with the v1 read-only tools
 * (get_current_context, get_snapshot_history) registered.
 *
 * The returned server is transport-agnostic. The caller (apps/web's MCP
 * route handler, Plan 04) attaches a StreamableHTTPServerTransport via
 * server.connect(transport). stdio is NEVER used — claude.ai web cannot
 * speak stdio, and the locked transport decision is Streamable HTTP.
 *
 * Loaders are injected (not constructed inside this package) so the MCP
 * package has zero coupling to apps/web's database layer.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetCurrentContext } from "./tools/get-current-context.js";
import { registerGetSnapshotHistory } from "./tools/get-snapshot-history.js";
import type { LoadSnapshot, LoadHistory } from "./data/load-snapshot.js";

export type CreateServerOptions = {
  /** Owner of the snapshot rows that should be served by this server instance. */
  userId: string;
  /** Loads the latest snapshot for userId (returns null if none). */
  loadSnapshot: LoadSnapshot;
  /** Loads metadata-only history for the last N days. */
  loadHistory: LoadHistory;
  /** Optional override for the MCP server name advertised on connect. */
  serverName?: string;
  /** Optional override for the MCP server version advertised on connect. */
  serverVersion?: string;
};

/**
 * Build an McpServer with both v1 tools registered.
 *
 * Call once per request (the userId is baked into the closure that the tool
 * handlers capture). The caller is responsible for connecting it to a
 * transport — typically StreamableHTTPServerTransport in apps/web's route
 * handler.
 */
export function createPersonalContextServer(opts: CreateServerOptions): McpServer {
  const server = new McpServer({
    name: opts.serverName ?? "hyperpolymath-personal-context",
    version: opts.serverVersion ?? "0.1.0",
  });
  registerGetCurrentContext(server, {
    userId: opts.userId,
    loadSnapshot: opts.loadSnapshot,
  });
  registerGetSnapshotHistory(server, {
    userId: opts.userId,
    loadHistory: opts.loadHistory,
  });
  return server;
}

/* ─── Re-exports for downstream consumers ─────────────────────────────── */

export type { LoadSnapshot, LoadHistory } from "./data/load-snapshot.js";

export {
  makeGetCurrentContextHandler,
  registerGetCurrentContext,
  getCurrentContextParamsShape,
  type GetCurrentContextCtx,
} from "./tools/get-current-context.js";

export {
  makeGetSnapshotHistoryHandler,
  registerGetSnapshotHistory,
  getSnapshotHistoryParamsShape,
  type GetSnapshotHistoryCtx,
} from "./tools/get-snapshot-history.js";

export {
  NodeSchema,
  EdgeSchema,
  ContextSnapshotSchema,
  CURRENT_SCHEMA_VERSION,
  type Node,
  type NodeType,
  type Edge,
  type EdgeType,
  type ContextSnapshot,
  type SnapshotHistoryEntry,
} from "./types.js";
