import { ensurePhysicalRealtimeBridge, physicalBus } from "@/lib/voice/physical-extension/bus";
import type {
  PhysicalJarvisResponseChunk,
  PhysicalJarvisResponseEnd,
  PhysicalJarvisResponseStart,
  PhysicalJarvisRoutineProgress,
  PhysicalJarvisToolCall,
  PhysicalStudioAction,
  PhysicalTranscript,
  PhysicalTrigger,
} from "@/lib/voice/physical-extension/types";
import { createClient } from "@/lib/supabase/server";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { isOwnerUser } from "@/lib/auth/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Allowed cross-origin clients. The wildcard was removed; only these
 * specific origins may receive the SSE stream from a cross-origin context.
 * The web browser is same-origin and does not need an ACAO header at all.
 */
const ALLOWED_ORIGINS = new Set([
  // Production web origin — desktop and mobile point at this
  "https://hyperpolymath.com",
  // Local dev — desktop/mobile dev builds targeting localhost
  "http://localhost:3000",
  "http://localhost:1420", // Tauri default dev port
]);

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin",
    };
  }
  // No ACAO header for unknown/null origins (same-origin web requests don't
  // need one, and unknown origins should be denied cross-origin access).
  return {};
}

/**
 * Authenticate the SSE subscriber. Three accepted paths:
 *
 * 1. Same-origin web browser (use-physical-extension.ts):
 *    Uses a relative URL so the browser sends its session cookie automatically.
 *    We validate via getClaims() — no header needed, no consumer change.
 *
 * 2. Mobile app (react-native-sse, apps/mobile/src/lib/sse.ts):
 *    Already sends `Authorization: Bearer hpd_...` — validated via
 *    validateDesktopBearer(), which is the established pattern for all
 *    cross-origin device clients.
 *
 * 3. Desktop Electron app (apps/desktop/src/physical-extender/sse-client.ts):
 *    Uses the native browser EventSource API which cannot send custom headers.
 *    Accepts a `?token=hpd_...` query param as a fallback bearer token.
 *    The desktop app needs a one-line update to append ?token= to the URL
 *    (it already stores an hpd_ device token in settings).
 *
 * Returns the authenticated userId on success, or null if unauthenticated.
 */
async function authenticate(req: Request): Promise<string | null> {
  // Path 1 & 2: try the Authorization header (mobile sends this; same-origin
  // web will also hit this branch on retry after initial cookie auth — but the
  // primary web path is the cookie branch below).
  const bearerUserId = await validateDesktopBearer(req);
  if (bearerUserId) return bearerUserId;

  // Path 3: query-param token for clients that cannot send headers (Electron
  // EventSource). Treat it identically to an Authorization: Bearer header by
  // constructing a synthetic Request with the header populated.
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) {
    const syntheticReq = new Request(req.url, {
      headers: { authorization: `Bearer ${queryToken}` },
    });
    const tokenUserId = await validateDesktopBearer(syntheticReq);
    if (tokenUserId) return tokenUserId;
  }

  // Path 1 (primary web browser path): cookie-based session via Supabase.
  // getClaims() validates the JWT from the session cookie — safe per CLAUDE.md
  // Critical Pattern 1 (never use getSession() in server code).
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims?.sub) {
      return data.claims.sub as string;
    }
  } catch {
    // createClient() calls cookies() which can throw outside a request context
    // in some test harnesses — treat as unauthenticated rather than crashing.
  }

  return null;
}

export async function GET(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");

  const userId = await authenticate(req);
  if (!userId) {
    return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders(origin),
    });
  }

  // Owner-only: the bus is a single global emitter, so any subscriber would
  // receive every user's events. Until it's partitioned per user, restrict
  // the stream to the owner account (see lib/auth/owner.ts).
  if (!(await isOwnerUser(userId))) {
    return new Response("Forbidden", {
      status: 403,
      headers: corsHeaders(origin),
    });
  }

  // Cross-instance relay: without this, events emitted from another Vercel
  // lambda instance (e.g. the voice/transcript POST) never reach this SSE
  // stream's in-memory bus.
  ensurePhysicalRealtimeBridge();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      const triggerHandler = (data: PhysicalTrigger) => send("trigger", data);
      const transcriptHandler = (data: PhysicalTranscript) => send("transcript", data);
      const responseStartHandler = (data: PhysicalJarvisResponseStart) =>
        send("jarvis-response-start", data);
      const responseChunkHandler = (data: PhysicalJarvisResponseChunk) =>
        send("jarvis-response-chunk", data);
      const toolCallHandler = (data: PhysicalJarvisToolCall) => send("jarvis-tool-call", data);
      // MAJOR-6 — the bus is a single global emitter. The route above
      // gates subscribers to `isOwnerUser`, but the studio-action payloads
      // now carry `userId` so we can drop foreign events at the SSE seam.
      // A missing userId is treated as "not for me" (belt-and-braces:
      // legacy emitters pre-fix are effectively dropped so the invariant
      // doesn't silently regress).
      const studioActionHandler = (data: PhysicalStudioAction) => {
        if (data.userId !== userId) return;
        send("studio-action", data);
      };
      const responseEndHandler = (data: PhysicalJarvisResponseEnd) =>
        send("jarvis-response-end", data);
      const routineProgressHandler = (data: PhysicalJarvisRoutineProgress) =>
        send("jarvis-routine-progress", data);

      physicalBus.on("trigger", triggerHandler);
      physicalBus.on("transcript", transcriptHandler);
      physicalBus.on("jarvis-response-start", responseStartHandler);
      physicalBus.on("jarvis-response-chunk", responseChunkHandler);
      physicalBus.on("jarvis-tool-call", toolCallHandler);
      physicalBus.on("studio-action", studioActionHandler);
      physicalBus.on("jarvis-response-end", responseEndHandler);
      physicalBus.on("jarvis-routine-progress", routineProgressHandler);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      // MINOR-5 — cleanup is called from three paths (enqueue failure,
      // heartbeat failure, req.signal abort). Guard so listener detach and
      // controller.close() run at most once, avoiding a benign but noisy
      // double-cleanup on graceful disconnect.
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        physicalBus.off("trigger", triggerHandler);
        physicalBus.off("transcript", transcriptHandler);
        physicalBus.off("jarvis-response-start", responseStartHandler);
        physicalBus.off("jarvis-response-chunk", responseChunkHandler);
        physicalBus.off("jarvis-tool-call", toolCallHandler);
        physicalBus.off("studio-action", studioActionHandler);
        physicalBus.off("jarvis-response-end", responseEndHandler);
        physicalBus.off("jarvis-routine-progress", routineProgressHandler);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup, { once: true });

      send("hello", { at: Date.now() });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders(origin),
    },
  });
}

export function OPTIONS(req: Request): Response {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
