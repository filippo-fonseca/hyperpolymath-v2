import { studioExecutorContext } from "../_executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await studioExecutorContext(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    await auth.executor.readWhatsapp({ since_hours: 168, maxResults: 60 }, auth.ctx)
  );
}
