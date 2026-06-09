/**
 * /api/mcp/[...transport] — Streamable HTTP MCP endpoint.
 *
 * Phase 999.12 MCP-02 / MCP-03.
 *
 * ─── SDK integration choice ───────────────────────────────────────────────
 * Installed: @modelcontextprotocol/sdk ^1.29.0 (verified in apps/web).
 *
 * The SDK ships TWO Streamable HTTP transports:
 *   - StreamableHTTPServerTransport (server/streamableHttp.js) — Node
 *     IncomingMessage/ServerResponse via an @hono/node-server wrapper.
 *     Wrong shape for Next.js App Router which speaks Web Standard
 *     Request/Response.
 *   - WebStandardStreamableHTTPServerTransport (server/webStandardStreamableHttp.js)
 *     — `handleRequest(req: Request, options?): Promise<Response>`. This is
 *     EXACTLY the App Router route-handler contract. The SDK docs explicitly
 *     reference Cloudflare Workers and Hono for this transport; Next.js App
 *     Router routes are the same shape.
 *
 * We choose WebStandardStreamableHTTPServerTransport — zero adapter code,
 * no Express, no Node-shim. The catch-all [...transport] segment matches
 * the MCP SDK's session-routing convention (the transport reads the path
 * suffix from req.url internally for SSE vs. POST routing).
 *
 * ─── Auth ─────────────────────────────────────────────────────────────────
 * Bearer token in Authorization header. verifyBearer() SHA-256s the value
 * and looks up integration_tokens (provider='mcp_agent') for a hash match;
 * on hit returns the owning userId. The MCP server instance is built
 * per-request with userId baked into the loader closures, so cross-user
 * leakage is structurally impossible.
 *
 * ─── Runtime ──────────────────────────────────────────────────────────────
 * Node, not Edge. Drizzle + postgres driver + the MCP SDK all require Node.
 * maxDuration=60 covers worst-case SSE handshake + first tool response;
 * actual tool execution is sub-second for v1's snapshot sizes.
 */

import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPersonalContextServer } from "@hyperpolymath/personal-context-mcp";
import { db } from "@/lib/db";
import { verifyBearer } from "@/lib/mcp/verify-bearer";
import { makeLoadSnapshot, makeLoadHistory } from "@/lib/mcp/load-snapshot-db";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function authenticate(
  req: Request,
): Promise<{ ok: true; userId: string } | Response> {
  const auth = req.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await verifyBearer(token);
  if (!result.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return result;
}

async function handle(req: Request): Promise<Response> {
  const authResult = await authenticate(req);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  // Build a fresh server + transport per request. Stateless mode (no
  // sessionIdGenerator) — the v1 tools are pure functions of the latest
  // snapshot row, so there's no per-session state worth carrying. Saves
  // the in-memory session map and the 400/404 session-validation paths.
  const server = createPersonalContextServer({
    userId,
    loadSnapshot: makeLoadSnapshot(db),
    loadHistory: makeLoadHistory(db),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: omit sessionIdGenerator entirely (SDK contract — undefined
    // means "no session management, no session ID in responses").
    sessionIdGenerator: undefined,
    // Prefer direct JSON responses when SSE isn't needed — simpler for the
    // typical "tools/list" + "tools/call" pattern. The transport still
    // upgrades to SSE if the client sends Accept: text/event-stream.
    enableJsonResponse: true,
  });

  await server.connect(transport);

  // The SDK transport's handleRequest takes a Web Standard Request and
  // returns a Web Standard Response — both already match Next.js App
  // Router's route-handler contract, so we forward without adaptation.
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
