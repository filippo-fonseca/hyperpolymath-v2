/**
 * Public mobile bootstrap — returns the Supabase URL + anon key the Expo app
 * needs for Google OAuth. Both values are already shipped to every web browser
 * as `NEXT_PUBLIC_*`; this endpoint lets the phone discover them from the
 * configured server URL without baking secrets into the binary (and without
 * a separate EAS env dance for local LAN builds).
 *
 * CORS is open: these keys are public by design.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "supabase_not_configured" },
      { status: 503, headers: CORS },
    );
  }
  return Response.json(
    {
      supabaseUrl,
      supabaseAnonKey,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=300" } },
  );
}
