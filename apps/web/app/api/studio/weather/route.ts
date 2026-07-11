import { studioExecutorContext } from "../_executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await studioExecutorContext();
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await auth.executor.getWeather({}, auth.ctx));
}
