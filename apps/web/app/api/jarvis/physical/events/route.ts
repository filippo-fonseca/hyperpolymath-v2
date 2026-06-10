import {
  ensurePhysicalRealtimeBridge,
  physicalBus,
} from "@/lib/voice/physical-extension/bus";
import type {
  PhysicalJarvisResponseChunk,
  PhysicalJarvisResponseEnd,
  PhysicalJarvisResponseStart,
  PhysicalJarvisToolCall,
  PhysicalTranscript,
  PhysicalTrigger,
} from "@/lib/voice/physical-extension/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(req: Request): Promise<Response> {
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
      const responseStartHandler = (data: PhysicalJarvisResponseStart) => send("jarvis-response-start", data);
      const responseChunkHandler = (data: PhysicalJarvisResponseChunk) => send("jarvis-response-chunk", data);
      const toolCallHandler = (data: PhysicalJarvisToolCall) => send("jarvis-tool-call", data);
      const responseEndHandler = (data: PhysicalJarvisResponseEnd) => send("jarvis-response-end", data);

      physicalBus.on("trigger", triggerHandler);
      physicalBus.on("transcript", transcriptHandler);
      physicalBus.on("jarvis-response-start", responseStartHandler);
      physicalBus.on("jarvis-response-chunk", responseChunkHandler);
      physicalBus.on("jarvis-tool-call", toolCallHandler);
      physicalBus.on("jarvis-response-end", responseEndHandler);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      const cleanup = () => {
        physicalBus.off("trigger", triggerHandler);
        physicalBus.off("transcript", transcriptHandler);
        physicalBus.off("jarvis-response-start", responseStartHandler);
        physicalBus.off("jarvis-response-chunk", responseChunkHandler);
        physicalBus.off("jarvis-tool-call", toolCallHandler);
        physicalBus.off("jarvis-response-end", responseEndHandler);
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
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
