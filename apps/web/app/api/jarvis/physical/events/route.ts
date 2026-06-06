import { physicalBus } from "@/lib/voice/physical-extension/bus";
import type {
  PhysicalTranscript,
  PhysicalTrigger,
} from "@/lib/voice/physical-extension/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(req: Request): Promise<Response> {
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

      physicalBus.on("trigger", triggerHandler);
      physicalBus.on("transcript", transcriptHandler);

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
    },
  });
}
