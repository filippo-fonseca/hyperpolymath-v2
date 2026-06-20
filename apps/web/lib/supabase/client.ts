import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton — one browser client per page session.
// The accessToken callback is called by Realtime before every channel join
// and reconnect, so channels always carry the user's JWT rather than the
// anon key. Without this, INITIAL_SESSION fires async and channels join
// before setAuth() is called, which causes RLS-scoped postgres_changes
// subscriptions to be silently rejected (anon role has no SELECT policy).
let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const c = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        accessToken: async () => {
          const { data } = await c.auth.getSession();
          return data.session?.access_token ?? null;
        },
      },
    }
  );

  _client = c;
  return _client;
}
