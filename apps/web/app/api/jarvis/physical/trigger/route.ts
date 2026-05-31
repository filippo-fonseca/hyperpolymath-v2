import type { NextRequest } from "next/server";

import { emitPhysicalTrigger } from "@/lib/voice/physical-extension/bus";
import type { PhysicalTrigger } from "@/lib/voice/physical-extension/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const expected = process.env.PHYSICAL_TRIGGER_SECRET;
  if (!expected) {
    return Response.json(
      { error: "PHYSICAL_TRIGGER_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const provided = req.headers.get("x-trigger-secret");
  if (!provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<PhysicalTrigger>;

  const payload: PhysicalTrigger = {
    source: body.source ?? "arduino-df2301q",
    commandId: typeof body.commandId === "number" ? body.commandId : -1,
    commandName: body.commandName,
    at: Date.now(),
  };

  emitPhysicalTrigger(payload);

  return Response.json({ ok: true, at: payload.at });
}
